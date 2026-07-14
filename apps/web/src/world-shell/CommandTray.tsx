import type { RefObject } from 'react';

import type { ShellAgent } from './model.js';

export interface CommandTrayProps {
  command: string;
  expanded: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  selectedAgent: ShellAgent;
  onCommandChange: (value: string) => void;
  onDispatch: () => void;
  onExpandedChange: () => void;
}

const suggestions = [
  'Check latest weather',
  'Search base rate',
  'Ask Professor',
  'Call meeting',
] as const;

export function CommandTray({
  command,
  expanded,
  inputRef,
  onCommandChange,
  onDispatch,
  onExpandedChange,
  selectedAgent,
}: CommandTrayProps) {
  return (
    <footer className="atlas-command-tray" aria-label="Agent command desk">
      <div className="atlas-command-agent">
        <span
          className="atlas-portrait atlas-portrait--small"
          data-agent={selectedAgent.id}
          aria-hidden="true"
        >
          <i />
        </span>
        <span>
          <small>Commanding</small>
          <strong>{selectedAgent.name}</strong>
        </span>
      </div>

      <form
        className="atlas-command-form"
        onSubmit={(event) => {
          event.preventDefault();
          onDispatch();
        }}
      >
        <label className="atlas-visually-hidden" htmlFor="atlas-command-input">
          Command {selectedAgent.name}
        </label>
        <span aria-hidden="true">›</span>
        <input
          autoComplete="off"
          id="atlas-command-input"
          onChange={(event) => onCommandChange(event.target.value)}
          placeholder={`Give ${selectedAgent.name} a research objective…`}
          ref={inputRef}
          value={command}
        />
        <button disabled={command.trim().length === 0} type="submit">
          Dispatch <kbd>↵</kbd>
        </button>
      </form>

      <div className="atlas-command-suggestions" aria-label="Suggested commands">
        <small>Suggested</small>
        {suggestions.map((suggestion) => (
          <button key={suggestion} onClick={() => onCommandChange(suggestion)} type="button">
            {suggestion}
          </button>
        ))}
      </div>

      <button
        aria-expanded={expanded}
        className="atlas-tray-expand"
        onClick={onExpandedChange}
        type="button"
      >
        {expanded ? 'Close queue' : 'Mission queue'}{' '}
        <span aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
      </button>

      <div className="atlas-command-status">
        <i aria-hidden="true" />
        <small>World live</small>
        <strong>18:32:14</strong>
      </div>

      {expanded && (
        <section className="atlas-command-queue" aria-labelledby="queue-heading">
          <div>
            <span className="atlas-kicker">Draft interpretation</span>
            <h2 id="queue-heading">Mission queue</h2>
            <p>
              P1 keeps commands as drafts. P2 will validate, confirm, and append authoritative
              mission events.
            </p>
          </div>
          <ol>
            <li>
              <span>1</span>
              <strong>Observe conditions</strong>
              <small>Mira → Weather Tower</small>
            </li>
            <li>
              <span>2</span>
              <strong>Search history</strong>
              <small>Orin → Archive Quarter</small>
            </li>
          </ol>
        </section>
      )}
    </footer>
  );
}
