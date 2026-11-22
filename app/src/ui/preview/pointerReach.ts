/* What of the scene answers the pointer in the Preview. The objects and the camera's rectangles
 * never answer it together (D192):
 *   - 'objects': the scene's objects, as ever — a hover outlines one, a click selects it, a drag
 *     moves it, the handles, the selection rectangle, the glyphs picked with Alt, its menu;
 *   - 'camera': the camera's rectangles alone, in the world view (the multicamera on, not the
 *     camera view): the objects are drawn and left alone, so that nothing of them is taken or moved
 *     by a press meant for the camera. They are selected in the camera view, on the timeline, or
 *     there with F held (`useObjectsKey.ts`): while the key is down the world view answers as the
 *     camera view does — 'objects' —, and the camera's rectangles are the ones left alone;
 *   - 'none': nothing, while the scene plays or the fly key (T, Shift+T) gives the mouse to the
 *     timeline: the pointer would outline, select and move what is passing by.
 * A mode that has the canvas — align by symbol, colours in order, Edit path, a line drawn or
 * shaped, a shape's target chosen — was started on purpose and goes on as it is: it reads the
 * objects its own way, wherever it was started.
 *
 * The view is nobody's but the designer's: the middle button and Alt pan it and Ctrl/⌘ + wheel
 * zooms it, whatever answers. */

export type PointerReach = 'objects' | 'camera' | 'none';

export function pointerReach(state: {
  /** The world view: the multicamera is on and the Preview does not look through the camera. */
  world: boolean;
  /** A mode of the Preview has the canvas. */
  mode: boolean;
  /** The scene plays. */
  playing: boolean;
  /** The fly key is held: the mouse moves the timeline's view, or the playhead. */
  flying: boolean;
  /** F is held: the objects answer in the world view too. */
  objectsKey?: boolean;
}): PointerReach {
  if (state.mode) return 'objects';
  if (state.playing || state.flying) return 'none';
  return state.world && !state.objectsKey ? 'camera' : 'objects';
}
