//! 自定义提供商的对外绑定；原始 ID 和别名各自控制可见性及路由。

use serde_json::{json, Value};

use crate::server::core::capability;
use crate::server::core::model_meta;
use crate::server::core::models::model_id;

use std::collections::{HashMap, HashSet};

use crate::server::errors::GatewayError;

pub(super) fn normalize(models: &mut [Value], mappings: &mut Vec<Value>) {
    for model in models.iter_mut() {
        let id = model_id(model);
        // 精确：只有同名同字才是「这条模型的历史自映射」
        if let Some(legacy) = mappings.iter().find(|mapping| {
            text(mapping, "alias") == id && text(mapping, "target") == id
        }) {
            model["enabled"] = Value::Bool(enabled(model) && enabled(legacy));
            if !text(legacy, "reasoning").is_empty() {
                model["reasoning"] = legacy["reasoning"].clone();
            }
        }
    }
    // 自映射（alias 与上游名完全一致）= 默认绑定，由模型行本身表达，不留在 mappings 里。
    // 精确比较：大小写不同的别名是另一条映射，不能当成自映射丢掉。
    mappings.retain(|mapping| {
        !(text(mapping, "alias") == text(mapping, "target")
            && models
                .iter()
                .any(|model| model_id(model) == text(mapping, "target")))
    });
    // 已占用的对外名。原样存，不折叠大小写 —— 见 bindings() 的说明。
    let mut claimed = models
        .iter()
        .filter(|model| enabled(model))
        .map(model_id)
        .collect::<HashSet<_>>();
    for carried in [true, false] {
        for mapping in mappings.iter_mut().filter(|mapping| {
            models
                .iter()
                .any(|model| model_id(model) == text(mapping, "target"))
                == carried
        }) {
            if enabled(mapping) && !claimed.insert(text(mapping, "alias").to_string()) {
                mapping["enabled"] = Value::Bool(false);
            }
        }
    }
}

fn text<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn enabled(value: &Value) -> bool {
    value
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

/// 收集「(对外名, 上游名, 是否启用)」三元组，用于冲突判定。
///
/// **不做大小写折叠**：对外名是客户端可见的模型 ID，调用侧按精确名匹配，
/// `GLM-5.3-Flash` 与 `glm-5.3-flash` 是两个不同的模型，不该互相判冲突。
/// （折叠成小写会让后者被当成前者的重复，报「不能同时启用多个绑定」。）
fn bindings(models: &[Value], mappings: &[Value]) -> Vec<(String, String, bool)> {
    models
        .iter()
        .map(|model| {
            let id = model_id(model);
            (id.clone(), id, enabled(model))
        })
        .chain(mappings.iter().map(|mapping| {
            (
                text(mapping, "alias").to_string(),
                text(mapping, "target").to_string(),
                enabled(mapping),
            )
        }))
        .collect()
}

pub(super) fn validate_change(
    previous: &Value,
    models: &[Value],
    mappings: &[Value],
) -> Result<(), GatewayError> {
    let old_models = previous
        .get("models")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let old_mappings = previous
        .get("mappings")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let previous = bindings(old_models, old_mappings);
    let mut active = HashMap::new();
    for (alias, target, enabled) in bindings(models, mappings) {
        if !previous
            .iter()
            .any(|(old_alias, old_target, _)| old_alias == &alias && old_target == &target)
            && previous
                .iter()
                .any(|(old_alias, _, enabled)| old_alias == &alias && *enabled)
        {
            return Err(GatewayError::with_status(
                409,
                format!("模型 ID「{alias}」在该提供商已有启用绑定，请先关闭它再添加"),
            ));
        }
        if enabled && active.insert(alias.clone(), target).is_some() {
            return Err(GatewayError::with_status(
                409,
                format!("模型 ID「{alias}」不能同时启用多个绑定"),
            ));
        }
    }
    for mapping in mappings {
        if !models
            .iter()
            .any(|model| model_id(model) == text(mapping, "target"))
        {
            let previous = old_mappings.iter().find(|old| {
                text(old, "alias") == text(mapping, "alias")
                    && text(old, "target") == text(mapping, "target")
            });
            if previous.is_none()
                || (enabled(mapping) && previous.is_some_and(|previous| !enabled(previous)))
            {
                return Err(GatewayError::bad_request(format!(
                    "该提供商的清单里没有模型「{}」",
                    text(mapping, "target")
                )));
            }
        }
    }
    Ok(())
}

pub fn resolve(provider: &Value, requested: &str) -> Option<(String, Option<String>)> {
    if !provider
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }
    let models = provider.get("models").and_then(Value::as_array)?;
    let mappings = provider
        .get("mappings")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let level = |entry: &Value| {
        entry
            .get("reasoning")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    if let Some(model) = models
        .iter()
        .find(|model| model_id(model) == requested)
    {
        let default = mappings.iter().find(|mapping| {
            mapping
                .get("alias")
                .and_then(Value::as_str)
                .is_some_and(|alias| alias == requested)
                && mapping
                    .get("target")
                    .and_then(Value::as_str)
                    .is_some_and(|target| target == requested)
        });
        if model
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(true)
            && default.map_or(true, |mapping| {
                mapping
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or(true)
            })
        {
            return Some((
                model_id(model),
                default.and_then(level).or_else(|| level(model)),
            ));
        }
    }
    mappings.iter().find_map(|mapping| {
        let alias = mapping.get("alias")?.as_str()?;
        let target = mapping.get("target")?.as_str()?;
        if alias != requested || alias == target
            || !mapping
                .get("enabled")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        {
            return None;
        }
        // target 的 enabled 只控制原始 ID，不能阻止别名调用它。
        let model = models
            .iter()
            .find(|model| model_id(model) == target)?;
        Some((model_id(model), level(mapping)))
    })
}

/// 该家对外的模型条目（`{id, …能力位}`）—— 清单出口与 `/v1/models` 共用。
///
/// 条目的 id 是**对外名**（原始 ID 或某个存活的别名），能力位则取自
/// **target 的登记条目**：别名的清单条目是这里现造的、没有自己的记录，
/// 而下游按对外名看到的能力必须与按原始 ID 看到的完全一致 —— 否则同一个
/// 上游模型会有两套互相打架的声明。
///
/// 能力位**平铺**在条目顶层（与各内置家清单同形，`list_item` 直接读它们）；
/// 存储里那层 `capabilities` 对象由 `capability::apply_overrides` 展开 ——
/// 归一也走它，手改数据里的坏值到不了出口。
///
/// 登记里**没写**的键由 models.dev 补（`core::model_meta::apply`）——那条路径的
/// 优先级与内置家同一条：用户登记的值（上面的 `capabilities`）> models.dev >
/// 未声明。自定义家的条目只服务对外清单与管理页的「这家有哪些模型」，
/// 它不出现在内置家的管理视图里（那套读的是 `providers::catalog::manage_view`）。
pub fn public_models(provider: &Value) -> Vec<Value> {
    let models = provider
        .get("models")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let mut names = Vec::new();
    names.extend(models.iter().map(model_id));
    if let Some(mappings) = provider.get("mappings").and_then(Value::as_array) {
        names.extend(mappings.iter().filter_map(|mapping| {
            mapping
                .get("alias")
                .and_then(Value::as_str)
                .map(str::to_string)
        }));
    }
    let mut result = Vec::new();
    for name in names {
        if name.is_empty()
            || result
                .iter()
                .any(|model| model_id(model) == name)
        {
            continue;
        }
        let Some((target, _)) = resolve(provider, &name) else {
            continue;
        };
        let mut item = json!({ "id": name });
        let capabilities = capability::normalize_object(
            models
                .iter()
                .find(|model| model_id(model) == target)
                .and_then(|model| model.get("capabilities")),
        );
        capability::apply_overrides(&mut item, &capabilities);
        model_meta::apply(&mut item);
        result.push(item);
    }
    result
}
