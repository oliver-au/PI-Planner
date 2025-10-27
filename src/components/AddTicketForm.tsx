import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { usePiStore } from '../store/piStore';
import { useShallow } from 'zustand/react/shallow';
import { BACKLOG_COLUMN_ID, UNASSIGNED_DEVELOPER_ID } from '../constants';

type FormState = {
  key: string;
  name: string;
  storyPoints: string;
  featureId: string;
  developerId: string;
  sprintId: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

export function AddTicketForm() {
  const { developers, features, sprints, currentSprintId } = usePiStore(
    useShallow((state) => ({
      developers: state.developers,
      features: state.features,
      sprints: state.sprints,
      currentSprintId: state.currentSprintId,
    })),
  );
  const orderedSprints = useMemo(
    () => [...sprints].sort((a, b) => a.order - b.order),
    [sprints],
  );
  const addTicket = usePiStore((state) => state.addTicket);
  const announce = usePiStore((state) => state.announce);

  const initialForm = useMemo<FormState>(
    () => ({
      key: 'ART-',
      name: '',
      storyPoints: '3',
      featureId: features[0]?.id ?? '',
      developerId:
        developers.find((dev) => dev.id === UNASSIGNED_DEVELOPER_ID)?.id ??
        developers[0]?.id ??
        UNASSIGNED_DEVELOPER_ID,
      sprintId: currentSprintId ?? BACKLOG_COLUMN_ID,
    }),
    [developers, features, currentSprintId],
  );

  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});

  const handleChange = (
    field: keyof FormState,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedKey = form.key.trim().toUpperCase();
    const trimmedName = form.name.trim();
    const storyPoints = Number.parseInt(form.storyPoints, 10);

    const nextErrors: FormErrors = {};
    if (!trimmedKey) nextErrors.key = 'Issue key is required.';
    if (!trimmedName) nextErrors.name = 'Ticket name is required.';
    if (Number.isNaN(storyPoints) || storyPoints <= 0) {
      nextErrors.storyPoints = 'Story points must be a positive number.';
    }
    if (!form.featureId) nextErrors.featureId = 'Feature is required.';
    if (!form.sprintId) nextErrors.sprintId = 'Sprint is required.';

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      announce('Add ticket form has validation errors.');
      return;
    }

    addTicket({
      key: trimmedKey,
      name: trimmedName,
      storyPoints,
      developerId: form.developerId,
      featureId: form.featureId,
      sprintIds: [form.sprintId],
    });

    announce(
      `${trimmedKey} added to ${sprintName(form.sprintId, orderedSprints)}.`,
    );
    setForm({
      ...initialForm,
      developerId: form.developerId,
      featureId: form.featureId,
      sprintId: form.sprintId,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-lg border border-slate-200 bg-white/80 p-4 shadow-sm lg:grid-cols-6"
    >
      <Field
        label="Jira Issue #"
        htmlFor="issue-key"
        error={errors.key}
      >
        <input
          id="issue-key"
          name="key"
          value={form.key}
          onChange={(event) => handleChange('key', event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="ART-123"
          autoComplete="off"
        />
      </Field>

      <Field
        label="Ticket name"
        htmlFor="ticket-name"
        error={errors.name}
        className="lg:col-span-2"
      >
        <input
          id="ticket-name"
          name="name"
          value={form.name}
          onChange={(event) => handleChange('name', event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Short summary"
        />
      </Field>

      <Field
        label="Story points"
        htmlFor="story-points"
        error={errors.storyPoints}
      >
        <input
          id="story-points"
          name="storyPoints"
          inputMode="numeric"
          value={form.storyPoints}
          onChange={(event) => handleChange('storyPoints', event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </Field>

      <Field
        label="Feature"
        htmlFor="feature"
        error={errors.featureId}
      >
        <select
          id="feature"
          name="featureId"
          value={form.featureId}
          onChange={(event) => handleChange('featureId', event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {features.map((feature) => (
            <option key={feature.id} value={feature.id}>
              {feature.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Developer (optional)"
        htmlFor="developer"
        error={errors.developerId}
      >
        <select
          id="developer"
          name="developerId"
          value={form.developerId}
          onChange={(event) => handleChange('developerId', event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {developers.map((developer) => (
            <option key={developer.id} value={developer.id}>
              {developer.name}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Sprint"
        htmlFor="sprint"
        error={errors.sprintId}
      >
        <select
          id="sprint"
          name="sprintId"
          value={form.sprintId}
          onChange={(event) => handleChange('sprintId', event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value={BACKLOG_COLUMN_ID}>Backlog (unscheduled)</option>
          {orderedSprints.map((sprint) => (
            <option key={sprint.id} value={sprint.id}>
              {sprint.name}
              {currentSprintId === sprint.id ? ' (Current)' : ''}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex items-end lg:col-span-1">
        <button
          type="submit"
          className="w-full rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
        >
          Add ticket
        </button>
      </div>
    </form>
  );
}

type FieldProps = {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string;
  className?: string;
};

function Field({ label, htmlFor, children, error, className }: FieldProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={`flex flex-col gap-2 text-sm ${className ?? ''}`}
    >
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-red-600" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const sprintName = (
  sprintId: string,
  sprints: { id: string; name: string }[],
) => {
  if (sprintId === BACKLOG_COLUMN_ID) return 'Backlog';
  return sprints.find((sprint) => sprint.id === sprintId)?.name ?? sprintId;
};
