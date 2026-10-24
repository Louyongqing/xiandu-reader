import { Check, Minus, Plus } from 'lucide-react'
import type { ReaderSettings } from '../types'

export function Appearance({
  settings,
  onChange,
  pdf = false,
}: {
  settings: ReaderSettings
  onChange: (value: ReaderSettings) => void
  pdf?: boolean
}) {
  return (
    <div className="appearance">
      <div className="setting-label">阅读背景</div>
      <div className="theme-options">
        {(
          [
            ['white', '纯白'],
            ['paper', '纸张'],
            ['sage', '护眼'],
            ['night', '夜间'],
          ] as const
        ).map(([value, label]) => (
          <button
            className={`theme-option theme-${value} ${settings.theme === value ? 'selected' : ''}`}
            key={value}
            onClick={() => onChange({ ...settings, theme: value })}
            aria-pressed={settings.theme === value}
            aria-label={`${label}背景`}
          >
            <span>{settings.theme === value ? <Check size={18} /> : 'Aa'}</span>
            <small>{label}</small>
          </button>
        ))}
      </div>
      {pdf ? (
        <p className="settings-note">PDF 保留原书页面，可在阅读页缩放。背景设置用于页面周围。</p>
      ) : (
        <>
          <div className="setting-row">
            <span>字号</span>
            <div className="stepper">
              <button
                aria-label="减小字号"
                disabled={settings.fontSize <= 14}
                onClick={() => onChange({ ...settings, fontSize: settings.fontSize - 1 })}
              >
                <Minus size={16} />
              </button>
              <span>{settings.fontSize}</span>
              <button
                aria-label="增大字号"
                disabled={settings.fontSize >= 28}
                onClick={() => onChange({ ...settings, fontSize: settings.fontSize + 1 })}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="setting-row">
            <span>字体</span>
            <div className="segmented">
              {(['serif', 'sans'] as const).map((font) => (
                <button
                  key={font}
                  aria-pressed={settings.font === font}
                  className={settings.font === font ? 'selected' : ''}
                  onClick={() => onChange({ ...settings, font })}
                >
                  {font === 'serif' ? '宋体' : '黑体'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>行距</span>
            <div className="segmented">
              {([1.6, 1.9, 2.2] as const).map((value, index) => (
                <button
                  key={value}
                  aria-pressed={settings.lineHeight === value}
                  className={settings.lineHeight === value ? 'selected' : ''}
                  onClick={() => onChange({ ...settings, lineHeight: value })}
                >
                  {['紧凑', '适中', '宽松'][index]}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <span>翻页</span>
            <div className="segmented">
              {(['slide', 'instant', 'scroll'] as const).map((value, index) => (
                <button
                  key={value}
                  aria-pressed={settings.turn === value}
                  className={settings.turn === value ? 'selected' : ''}
                  onClick={() => onChange({ ...settings, turn: value })}
                >
                  {['滑动', '无动画', '滚动'][index]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
