import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Save, Loader2, RefreshCw, Trash2, PackagePlus } from 'lucide-react';
import { pluginsService } from '../services/settingsService';
import type { PluginStatus, PluginStatusTone, PluginView } from '../services/settingsService';

const TONE_CLASS: Record<PluginStatusTone, string> = {
  normal: 'text-ink dark:text-primary-100',
  success: 'text-primary-600 dark:text-primary-400',
  warning: 'text-pop-yellow',
  danger: 'text-pop-rose',
};

interface PluginCardProps {
  plugin: PluginView;
  onChanged?: () => void;
  /** 卸载回调（仅 imported 插件显示卸载按钮）；确认弹窗由父级处理 */
  onUninstall?: (plugin: PluginView) => void;
}

/**
 * 插件通用管理卡片：按插件 manifest 动态渲染设置表单、运行按钮和状态区。
 * status.running 为 true 时每 5 秒轮询状态直到任务结束（与旧版手动卡片轮询行为一致）。
 */
const PluginCard: React.FC<PluginCardProps> = ({ plugin, onChanged, onUninstall }) => {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(plugin.settings.map((field) => [field.key, field.value]))
  );
  const [status, setStatus] = useState<PluginStatus | null>(plugin.status);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setValues(Object.fromEntries(plugin.settings.map((field) => [field.key, field.value])));
    setStatus(plugin.status);
  }, [plugin]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await pluginsService.getStatus(plugin.id));
    } catch { /* 状态拉取失败保留旧值 */ }
  }, [plugin.id]);

  // running 时 5 秒轮询，结束后停
  useEffect(() => {
    if (status?.running && !pollRef.current) {
      pollRef.current = setInterval(() => { void refreshStatus(); }, 5000);
    }
    if (!status?.running && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.running, refreshStatus]);

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await pluginsService.updateSettings(plugin.id, values);
      setNotice({ tone: 'ok', text: '设置已保存' });
      onChanged?.();
    } catch (err: any) {
      setNotice({ tone: 'err', text: err?.response?.data?.error || '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async (actionId: string) => {
    setRunningAction(actionId);
    setNotice(null);
    try {
      const result = await pluginsService.run(plugin.id, actionId);
      setNotice({ tone: result.started ? 'ok' : 'err', text: result.message });
      if (result.started) {
        setStatus((prev) => (prev ? { ...prev, running: true } : { running: true, fields: [] }));
      }
    } catch (err: any) {
      setNotice({ tone: 'err', text: err?.response?.data?.error || '运行失败' });
    } finally {
      setRunningAction(null);
    }
  };

  const hasDirty = plugin.settings.some((field) => {
    if (field.type === 'secret') return values[field.key] !== '' && values[field.key] !== field.value;
    return values[field.key] !== field.value;
  });

  return (
    <motion.div className="card-block p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-52">
          <h3 className="font-display text-lg leading-snug text-ink dark:text-primary-100 break-words">
            {plugin.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-sans text-ink-muted dark:text-primary-100/50 border border-ink/20 dark:border-night-400 rounded px-1.5 py-0.5 whitespace-nowrap">
              v{plugin.version}
            </span>
            {plugin.imported && (
              <span className="inline-flex items-center gap-1 text-[10px] font-sans text-pop-purple border border-pop-purple/60 rounded px-1.5 py-0.5 whitespace-nowrap">
                <PackagePlus className="w-3 h-3 shrink-0" />已导入
              </span>
            )}
            {status?.running && (
              <span className="inline-flex items-center gap-1 text-xs text-action font-sans font-medium whitespace-nowrap">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />运行中
              </span>
            )}
          </div>
          <p className="text-sm text-ink-muted dark:text-primary-100/60 mt-1.5">{plugin.description}</p>
          {plugin.scheduleHint && (
            <p className="text-xs text-ink-muted/70 dark:text-primary-100/40 mt-0.5">⏱ {plugin.scheduleHint}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {plugin.imported && onUninstall && (
            <button
              type="button"
              onClick={() => onUninstall(plugin)}
              className="btn-secondary !py-2 !px-3 !text-sm !border-pop-rose !text-pop-rose flex items-center gap-1.5"
              title="卸载此导入的插件"
            >
              <Trash2 className="w-4 h-4" />
              卸载插件
            </button>
          )}
          <button
            type="button"
            onClick={() => void refreshStatus()}
            className="btn-icon !w-8 !h-8"
            aria-label="刷新状态"
            title="刷新状态"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 设置表单（manifest 驱动） */}
      {plugin.settings.length > 0 && (
        <div className="space-y-3">
          {plugin.settings.map((field) => {
            const value = values[field.key] ?? '';
            if (field.type === 'boolean') {
              const on = value === 'true';
              return (
                <label key={field.key} className="flex items-center justify-between gap-3 cursor-pointer">
                  <span>
                    <span className="text-sm font-medium text-ink dark:text-primary-100">{field.label}</span>
                    {field.helpText && <span className="block text-xs text-ink-muted dark:text-primary-100/50">{field.helpText}</span>}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => setValues((prev) => ({ ...prev, [field.key]: on ? 'false' : 'true' }))}
                    className={`relative w-11 h-6 rounded-full border-2 border-ink dark:border-night-400 transition-colors shrink-0 ${on ? 'bg-action' : 'bg-white dark:bg-night-200'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border-2 border-ink dark:border-night-400 transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              );
            }
            return (
              <div key={field.key}>
                <label className="block text-sm font-medium text-ink dark:text-primary-100 mb-1" htmlFor={`plugin-${plugin.id}-${field.key}`}>
                  {field.label}
                </label>
                {field.type === 'select' ? (
                  <select
                    id={`plugin-${plugin.id}-${field.key}`}
                    value={value}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="input-block !py-2"
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`plugin-${plugin.id}-${field.key}`}
                    type={field.type === 'secret' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                    value={value}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    className="input-block !py-2"
                  />
                )}
                {field.helpText && <p className="text-xs text-ink-muted dark:text-primary-100/50 mt-1">{field.helpText}</p>}
              </div>
            );
          })}

          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSave} disabled={saving || !hasDirty} className="btn-primary !py-2 !px-4 !text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              保存设置
            </button>
            {notice && (
              <span className={`text-xs ${notice.tone === 'ok' ? 'text-primary-600 dark:text-primary-400' : 'text-pop-rose'}`}>
                {notice.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 运行按钮 */}
      {plugin.runActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {plugin.runActions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={runningAction !== null || Boolean(status?.running)}
              onClick={() => void handleRun(action.id)}
              className={`!py-2 !px-4 !text-sm flex items-center gap-1.5 ${action.danger ? 'btn-danger' : 'btn-action'}`}
            >
              {runningAction === action.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* 状态区 */}
      {status && (status.fields.length > 0 || status.detail) && (
        <div className="rounded-xl bg-primary-50 dark:bg-night-200 border-2 border-ink/10 dark:border-night-400 p-3 space-y-1.5">
          {status.fields.map((field) => (
            <div key={field.label} className="flex items-baseline gap-2 text-sm">
              <span className="text-xs text-ink-muted dark:text-primary-100/50 w-20 shrink-0">{field.label}</span>
              <span className={`font-medium break-all ${TONE_CLASS[field.tone || 'normal']}`}>{field.value}</span>
            </div>
          ))}
          {status.detail && (
            <pre className="text-xs text-ink-muted dark:text-primary-100/60 whitespace-pre-wrap break-all font-sans max-h-40 overflow-y-auto pt-1 border-t border-ink/10 dark:border-night-400 mt-1">
              {status.detail}
            </pre>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default PluginCard;
