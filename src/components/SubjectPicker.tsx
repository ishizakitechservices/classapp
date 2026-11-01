import React from 'react';
import { Check } from 'lucide-react';
import {
  CORE_SUBJECTS,
  INTERNAL_SUBJECTS,
  electiveSubjectsByGroup,
  formOf,
  takesInternalSubjects,
  type SubjectDef,
} from '../shared/subjects';

interface SubjectPickerProps {
  /** The student's class — decides whether the Form 1–2 subjects appear. */
  className: string;
  /** Chosen elective codes. Core and internal subjects are automatic. */
  selected: string[];
  onChange: (codes: string[]) => void;
  /** Slightly tighter rows for use inside the Classes tab. */
  compact?: boolean;
}

const LockedRow: React.FC<{ subject: SubjectDef; hint?: string; compact?: boolean }> = ({
  subject,
  hint,
  compact,
}) => (
  <div
    className={`flex items-center gap-2.5 rounded-xl bg-neutral-100/70 dark:bg-neutral-800/60 px-3 ${
      compact ? 'py-1.5' : 'py-2'
    }`}
  >
    <Check className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{subject.name}</p>
      {hint && <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{hint}</p>}
    </div>
    <span className="text-[10px] font-mono text-neutral-400 shrink-0">{subject.code}</span>
  </div>
);

/**
 * The one subject selector, used by signup and by the Classes tab.
 * Core subjects are opt-in per student; internal (school) subjects stay fixed by form.
 */
export const SubjectPicker: React.FC<SubjectPickerProps> = ({ className, selected, onChange, compact }) => {
  const internal = takesInternalSubjects(className);
  const groups = electiveSubjectsByGroup();

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      const remaining = selected.filter((c) => c !== code);
      // Keep at least one core selection so a subject list is never empty.
      const stillHasCore = remaining.some((c) => CORE_SUBJECTS.some((s) => s.code === c));
      if (!stillHasCore) return;
      onChange(remaining);
      return;
    }
    onChange([...selected, code]);
  };

  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Core</h3>
          <span className="text-[10px] text-neutral-400">
            {selected.length} selected · pick any
          </span>
        </div>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Tap any core subject you study. At least one stays selected.
        </p>
        <div className="space-y-1">
          {CORE_SUBJECTS.map((s) => {
            const on = selected.includes(s.code);
            return (
              <button
                key={s.code}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(s.code)}
                className={`w-full text-left flex items-center gap-2.5 rounded-xl px-3 ${
                  compact ? 'py-1.5' : 'py-2'
                } border transition-colors ${
                  on
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                    : 'border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500'
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                    on
                      ? 'border-transparent bg-white/20 dark:bg-neutral-900/10'
                      : 'border-neutral-300 dark:border-neutral-600'
                  }`}
                >
                  {on && <Check className="w-3 h-3" />}
                </span>
                <span className="text-xs font-medium flex-1 min-w-0 truncate">{s.name}</span>
                <span className={`text-[10px] font-mono shrink-0 ${on ? 'opacity-70' : 'text-neutral-400'}`}>
                  {s.code}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Electives</h3>
          <span className="text-[10px] text-neutral-400">
            {selected.length} selected · usually 3
          </span>
        </div>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Choose the electives you actually study. Any combination is allowed.
        </p>

        {groups.map((group) => (
          <div key={group.group} className="space-y-1">
            <p className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 pt-1">{group.group}</p>
            <div className="grid grid-cols-1 gap-1">
              {group.subjects.map((s) => {
                const on = selected.includes(s.code);
                return (
                  <button
                    key={s.code}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.code)}
                    className={`w-full text-left flex items-center gap-2.5 rounded-xl px-3 ${
                      compact ? 'py-1.5' : 'py-2'
                    } border transition-colors ${
                      on
                        ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 hover:border-neutral-400 dark:hover:border-neutral-500'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                        on
                          ? 'border-transparent bg-white/20 dark:bg-neutral-900/10'
                          : 'border-neutral-300 dark:border-neutral-600'
                      }`}
                    >
                      {on && <Check className="w-3 h-3" />}
                    </span>
                    <span className="text-xs font-medium flex-1 min-w-0 truncate">{s.name}</span>
                    <span className={`text-[10px] font-mono shrink-0 ${on ? 'opacity-70' : 'text-neutral-400'}`}>
                      {s.code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {internal ? (
        <section className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">School subjects</h3>
            <span className="text-[10px] text-neutral-400">Form {formOf(className) ?? 1}–2 only</span>
          </div>
          <div className="space-y-1">
            {INTERNAL_SUBJECTS.map((s) => (
              <LockedRow key={s.code} subject={s} hint="Stops after Form 2" compact={compact} />
            ))}
          </div>
        </section>
      ) : (
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          Religion &amp; Ethics, Core IT and Physical Education &amp; Health are not studied in Form 3, so
          they are not part of your list.
        </p>
      )}
    </div>
  );
};

export default SubjectPicker;
