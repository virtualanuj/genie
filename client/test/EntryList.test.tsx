import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EntryList from '../src/EntryList.js';
import type { Entry } from '../src/api.js';

const entry: Entry = {
  id: 1, raw_text: 'buy milk', domain: 'personal', type: 'task', structured: '{}',
  tags: null, remind_at: null, recurrence: null, series_id: null,
  created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
};

const recurringEntry: Entry = {
  ...entry, id: 2, raw_text: 'pay rent',
  recurrence: JSON.stringify({ freq: 'monthly', interval: 1 }),
};

describe('EntryList', () => {
  it('renders each entry\'s text and a colored domain tag', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByText('buy milk')).toBeInTheDocument();
    expect(screen.getByText('personal')).toHaveClass('domain-personal');
    expect(screen.getByText('task')).toBeInTheDocument();
  });

  it('calls onDelete with the entry id when delete is clicked', () => {
    const onDelete = vi.fn();
    render(<EntryList entries={[entry]} onDelete={onDelete} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('clicking Edit reveals editable fields pre-filled with the entry\'s current values', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    expect(screen.getByDisplayValue('buy milk')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /domain/i })).toHaveValue('personal');
    expect(screen.getByRole('combobox', { name: /type/i })).toHaveValue('task');
  });

  it('calls onEdit with the edited fields when Save is clicked', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    fireEvent.change(screen.getByDisplayValue('buy milk'), { target: { value: 'buy oat milk' } });
    fireEvent.change(screen.getByRole('combobox', { name: /domain/i }), { target: { value: 'work' } });
    fireEvent.change(screen.getByRole('combobox', { name: /type/i }), { target: { value: 'note' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(1, { raw_text: 'buy oat milk', domain: 'work', type: 'note', recurrence: null });
  });

  it('Cancel exits edit mode without calling onEdit', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText('buy milk')).toBeInTheDocument();
  });

  it('shows a recurrence indicator for entries with a recurrence', () => {
    render(<EntryList entries={[recurringEntry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.getByTitle(/recurs monthly/i)).toBeInTheDocument();
  });

  it('does not show a recurrence indicator for non-recurring entries', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);
    expect(screen.queryByTitle(/recurs/i)).not.toBeInTheDocument();
  });

  it('edit form lets you set a recurrence on a non-recurring entry', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /repeats/i }), { target: { value: 'weekly' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(1, expect.objectContaining({ recurrence: { freq: 'weekly', interval: 1 } }));
  });

  it('edit form lets you clear an existing recurrence', () => {
    const onEdit = vi.fn();
    render(<EntryList entries={[recurringEntry]} onDelete={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /repeats/i }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onEdit).toHaveBeenCalledWith(2, expect.objectContaining({ recurrence: null }));
  });

  it('filters entries by domain when a filter pill is clicked', () => {
    const workEntry: Entry = { ...entry, id: 3, domain: 'work', raw_text: 'write report' };
    render(<EntryList entries={[entry, workEntry]} onDelete={() => {}} onEdit={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /^work$/i }));

    expect(screen.getByText('write report')).toBeInTheDocument();
    expect(screen.queryByText('buy milk')).not.toBeInTheDocument();
  });

  it('shows all entries again when All is selected', () => {
    const workEntry: Entry = { ...entry, id: 3, domain: 'work', raw_text: 'write report' };
    render(<EntryList entries={[entry, workEntry]} onDelete={() => {}} onEdit={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /^work$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));

    expect(screen.getByText('buy milk')).toBeInTheDocument();
    expect(screen.getByText('write report')).toBeInTheDocument();
  });

  it('sorts entries with a due date ascending before entries without one', () => {
    const soon: Entry = { ...entry, id: 4, raw_text: 'soon-task', remind_at: '2020-01-01T00:00:00.000Z' };
    const later: Entry = { ...entry, id: 5, raw_text: 'later-task', remind_at: '2020-06-01T00:00:00.000Z' };
    const noDue: Entry = { ...entry, id: 6, raw_text: 'someday-task', remind_at: null };
    render(<EntryList entries={[noDue, later, soon]} onDelete={() => {}} onEdit={() => {}} />);

    const texts = screen.getAllByText(/-task/).map((el) => el.textContent);
    expect(texts).toEqual(['soon-task', 'later-task', 'someday-task']);
  });

  it('gives each domain a distinctly colored tag class', () => {
    const workEntry: Entry = { ...entry, id: 3, domain: 'work', raw_text: 'write report' };
    const financeEntry: Entry = { ...entry, id: 4, domain: 'finance', raw_text: 'pay rent' };
    render(<EntryList entries={[entry, workEntry, financeEntry]} onDelete={() => {}} onEdit={() => {}} />);

    expect(screen.getByText('personal')).toHaveClass('domain-personal');
    expect(screen.getByText('work')).toHaveClass('domain-work');
    expect(screen.getByText('finance')).toHaveClass('domain-finance');
  });

  it('defaults to list layout and can switch to card layout', () => {
    render(<EntryList entries={[entry]} onDelete={() => {}} onEdit={() => {}} />);

    expect(document.querySelector('.entry-list')).toBeInTheDocument();
    expect(document.querySelector('.entry-cards')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /card view/i }));

    expect(document.querySelector('.entry-cards')).toBeInTheDocument();
    expect(document.querySelector('.entry-list')).not.toBeInTheDocument();
    expect(screen.getByText('buy milk')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));

    expect(document.querySelector('.entry-list')).toBeInTheDocument();
    expect(document.querySelector('.entry-cards')).not.toBeInTheDocument();
  });
});
