/* What the Templates tab has open (D121): the pop-up that lists templates, and over it the
 * dialog that asks for a template's values or the form that writes a template. A store, not the
 * tab's own state, so that a notice can open a pop-up, and so that each list keeps its search
 * while the editor is open. */
import { create } from 'zustand';
import { NO_TEMPLATE_FILTER, type TemplateFilter } from './library';
import type { ListedTemplate, TemplateView } from './templateList';
import type { UserTemplate } from './userLibrary';

export interface TemplatesUiState {
  /** The list on screen, if any. */
  view: TemplateView | null;
  /** The template whose values are being given ("Use"). */
  using: ListedTemplate | null;
  /** The form that writes a template: a new one (`editing: null`), or one of the user's. */
  form: { editing: UserTemplate | null } | null;
  /** The search and the filters of each list. */
  filters: Record<TemplateView, TemplateFilter>;
  open(view: TemplateView): void;
  /** Close the dialog on top: the values being given or the form, else the list. */
  close(): void;
  /** Open the form, over the list when one is on screen. */
  write(editing: UserTemplate | null): void;
  /** Close everything (a formula was made). */
  closeAll(): void;
  use(template: ListedTemplate): void;
  setFilter(view: TemplateView, filter: Partial<TemplateFilter>): void;
}

export const useTemplatesUi = create<TemplatesUiState>()((set, get) => ({
  view: null,
  using: null,
  form: null,
  filters: {
    default: NO_TEMPLATE_FILTER,
    mine: NO_TEMPLATE_FILTER,
    favorites: NO_TEMPLATE_FILTER,
  },
  open: (view) => set({ view, using: null, form: null }),
  close: () => set(get().using || get().form ? { using: null, form: null } : { view: null }),
  closeAll: () => set({ view: null, using: null, form: null }),
  use: (template) => set({ using: template, form: null }),
  write: (editing) => set({ form: { editing }, using: null }),
  setFilter: (view, filter) =>
    set((state) => ({
      filters: { ...state.filters, [view]: { ...state.filters[view], ...filter } },
    })),
}));
