/* The sections of the web documentation and the order of their pages (AUTHORING.md §5): the order
 * of the sidebar, of the previous/next links and of the sections in the search results.
 *
 * `tools/build.mjs` reads this file. A page's own head gives its title, its description and its
 * level; the `level` written here (and `difficulty`, for a tutorial) is the plan, and the build
 * reports a page whose `mfe:level` (or `mfe:difficulty`) says something else, so that the plan
 * and the pages never drift apart: change both together. A page listed here that does not exist
 * is an error; a page that exists and is not listed is reported too, but for the pages under
 * `authoring/`, which are for the authors of the documentation and stay out of the navigation.
 *
 * The home page (`index.html`) is not listed: it comes before the first section. */

/** The levels a page can have, in the order of difficulty. */
export const LEVELS = ['basic', 'intermediate', 'advanced', 'reference', 'tutorial'];

/** The difficulties a tutorial can have (its `mfe:difficulty`). */
export const DIFFICULTIES = ['basic', 'intermediate', 'advanced'];

/** The folder whose pages are built and checked but never listed. */
export const UNLISTED = ['authoring/'];

export const SECTIONS = [
  {
    id: 'start',
    title: 'Get started',
    pages: [
      { id: 'start/overview', level: 'basic' },
      { id: 'start/install', level: 'basic' },
      { id: 'start/first-animation', level: 'basic' },
      { id: 'start/interface', level: 'basic' },
      { id: 'start/projects', level: 'basic' },
    ],
  },
  {
    id: 'basics',
    title: 'Basics',
    pages: [
      { id: 'basics/formulas', level: 'basic' },
      { id: 'basics/preview', level: 'basic' },
      { id: 'basics/timeline', level: 'basic' },
      { id: 'basics/intro-outro', level: 'basic' },
      { id: 'basics/first-transform', level: 'basic' },
      { id: 'basics/export', level: 'basic' },
      { id: 'basics/slides', level: 'intermediate' },
    ],
  },
  {
    id: 'transforms',
    title: 'Transformations',
    pages: [
      { id: 'transforms/relations', level: 'intermediate' },
      { id: 'transforms/relation-editor', level: 'intermediate' },
      { id: 'transforms/previewing', level: 'intermediate' },
      { id: 'transforms/custom-paths', level: 'advanced' },
      { id: 'transforms/morph', level: 'advanced' },
      { id: 'transforms/recipes', level: 'intermediate' },
    ],
  },
  {
    id: 'animations',
    title: 'Animations and timing',
    pages: [
      { id: 'animations/blocks', level: 'intermediate' },
      { id: 'animations/groups', level: 'intermediate' },
      { id: 'animations/timing', level: 'intermediate' },
      { id: 'animations/camera', level: 'intermediate' },
    ],
  },
  {
    id: 'objects',
    title: 'Texts and objects',
    pages: [
      { id: 'objects/texts', level: 'intermediate' },
      { id: 'objects/templates', level: 'basic' },
      { id: 'objects/organizing', level: 'intermediate' },
      { id: 'objects/braces', level: 'intermediate' },
      { id: 'objects/shapes', level: 'intermediate' },
      { id: 'objects/lines-arrows', level: 'intermediate' },
    ],
  },
  {
    id: 'layout',
    title: 'Layout',
    pages: [
      { id: 'layout/align', level: 'intermediate' },
      { id: 'layout/align-symbol', level: 'advanced' },
      { id: 'layout/glyph-picking', level: 'intermediate' },
    ],
  },
  {
    id: 'color',
    title: 'Colour',
    pages: [
      { id: 'color/coloring', level: 'basic' },
      { id: 'color/palettes', level: 'intermediate' },
      { id: 'color/match-colors', level: 'intermediate' },
    ],
  },
  {
    id: 'sound',
    title: 'Audio and video',
    pages: [
      { id: 'sound/audio', level: 'intermediate' },
      { id: 'sound/video', level: 'intermediate' },
    ],
  },
  {
    id: 'manim',
    title: 'Manim',
    pages: [
      { id: 'manim/python', level: 'intermediate' },
      { id: 'manim/without-companion', level: 'intermediate' },
      { id: 'manim/ce-vs-gl', level: 'advanced' },
      { id: 'manim/companion', level: 'advanced' },
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    pages: [
      { id: 'reference/shortcuts', level: 'reference' },
      { id: 'reference/menus', level: 'reference' },
      { id: 'reference/preferences', level: 'reference' },
      { id: 'reference/glossary', level: 'reference' },
      { id: 'reference/troubleshooting', level: 'reference' },
      { id: 'reference/files', level: 'reference' },
    ],
  },
  {
    id: 'tutorials',
    title: 'Tutorials',
    pages: [
      { id: 'tutorials/index', level: 'tutorial' },
      { id: 'tutorials/linear-equation', level: 'tutorial', difficulty: 'basic' },
      { id: 'tutorials/pythagoras', level: 'tutorial', difficulty: 'basic' },
      { id: 'tutorials/quadratic-formula', level: 'tutorial', difficulty: 'intermediate' },
      { id: 'tutorials/derivative', level: 'tutorial', difficulty: 'advanced' },
      { id: 'tutorials/annotated-identity', level: 'tutorial', difficulty: 'advanced' },
    ],
  },
];
