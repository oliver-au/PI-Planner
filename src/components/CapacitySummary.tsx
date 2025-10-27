import { useEffect, useMemo, useRef } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';

export function CapacitySummary() {
  const { developers, sprints, getCapacityBy, announce, currentSprintId } = usePiStore(
    useShallow((state) => ({
      developers: state.developers,
      sprints: state.sprints,
      getCapacityBy: state.getCapacityBy,
      announce: state.announce,
      currentSprintId: state.currentSprintId,
    })),
  );
  const orderedSprints = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order),
    [sprints],
  );
  const matrix = useMemo(
    () =>
      developers.map((developer) =>
        orderedSprints.map((sprint) => ({
          developer,
          sprint,
          ...getCapacityBy(developer.id, sprint.id),
        })),
      ),
    [developers, orderedSprints, getCapacityBy],
  );

  const overCapacitySummary = useMemo(() => {
    const warnings: string[] = [];
    matrix.forEach((row) => {
      row.forEach((cell) => {
        if (cell.over) {
          warnings.push(
            `${cell.developer.name} in ${cell.sprint.name} (${cell.assigned}/${cell.capacity})`,
          );
        }
      });
    });
    return warnings.join('; ');
  }, [matrix]);

  const lastWarning = useRef('');
  useEffect(() => {
    if (overCapacitySummary && overCapacitySummary !== lastWarning.current) {
      announce(`Over capacity: ${overCapacitySummary}`);
      lastWarning.current = overCapacitySummary;
    }
    if (!overCapacitySummary) {
      lastWarning.current = '';
    }
  }, [announce, overCapacitySummary]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white/80 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-800">
          Team Capacity by Sprint
        </h2>
        <p className="text-xs text-slate-500">
          Assigned story points per developer and sprint
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Capacity summary: assigned story points vs capacity per developer
            and sprint.
          </caption>
          <thead>
            <tr className="bg-slate-50 text-xs uppercase text-slate-500">
              <th scope="col" className="px-4 py-3 font-semibold">
                Developer
              </th>
              {orderedSprints.map((sprint) => {
                const label =
                  currentSprintId && sprint.id === currentSprintId
                    ? `${sprint.name} (Current)`
                    : sprint.name;
                return (
                  <th
                    scope="col"
                    key={sprint.id}
                    className="px-4 py-3 font-semibold"
                  >
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, rowIndex) => (
              <tr
                key={row[0]?.developer.id ?? rowIndex}
                className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}
              >
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-700"
                >
                  {row[0]?.developer.name}
                </th>
                {row.map((cell) => (
                  <td
                    key={`${cell.developer.id}-${cell.sprint.id}`}
                    className={`px-4 py-3 text-sm ${
                      cell.over
                        ? 'border-l-4 border-red-500 bg-red-50 text-red-700'
                        : 'border-l-4 border-transparent text-slate-700'
                    }`}
                  >
                    <span className="font-semibold">
                      {cell.assigned}
                    </span>
                    <span aria-hidden="true"> / {cell.capacity}</span>
                    {cell.over ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        <span aria-hidden="true">⚠️</span>
                        Over capacity
                      </span>
                    ) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
