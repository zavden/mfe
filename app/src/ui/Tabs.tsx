/* Accessible tabs (WAI-ARIA tabs pattern): one tab stop for the tab list, arrow keys / Home / End
 * move between tabs, and every panel stays mounted (inactive ones are `hidden`) so switching
 * keeps their state. The caller owns which tab is active. */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { rovingIndex } from './focus';
import { Icon, type IconName } from './timeline/icons';

export interface TabDef<Id extends string> {
  id: Id;
  label: string;
  /** An icon over the label. */
  icon?: IconName;
  content: ReactNode;
}

export interface TabsProps<Id extends string> {
  tabs: readonly TabDef<Id>[];
  active: Id;
  onChange(id: Id): void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix of the test ids: `<prefix>-tab-<id>` and `<prefix>-panel-<id>`. */
  testId: string;
}

export function Tabs<Id extends string>({ tabs, active, onChange, label, testId }: TabsProps<Id>) {
  const base = useId();
  const buttons = useRef(new Map<Id, HTMLButtonElement>());
  const current = tabs.some((t) => t.id === active) ? active : tabs[0]!.id;

  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === current);
    const next = rovingIndex(event.key, index, tabs.length, 'horizontal');
    if (next === null) return;
    event.preventDefault();
    const id = tabs[next]!.id;
    onChange(id);
    buttons.current.get(id)?.focus();
  };

  return (
    <div className="tabs">
      <div className="tabs-list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) buttons.current.set(tab.id, el);
                else buttons.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? 'tabs-tab is-active' : 'tabs-tab'}
              data-testid={`${testId}-tab-${tab.id}`}
              onClick={() => onChange(tab.id)}
            >
              {tab.icon && (
                <span className="tabs-tab-icon">
                  <Icon name={tab.icon} />
                </span>
              )}
              <span className="tabs-tab-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== current}
          className="tabs-panel"
          data-testid={`${testId}-panel-${tab.id}`}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
