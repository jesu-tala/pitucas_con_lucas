/* ===================== NAVIGATION STACK =====================
   Single source of truth for "how deep into the app am I, and what does going back mean right
   now" -- the back arrow (menu/group), the left-edge swipe gesture, the OS/browser back
   (popstate, where the platform actually provides one), and closing a sheet ALL push/pop the
   SAME stack instead of each carrying its own bespoke reset logic. That's what used to make
   them drift out of sync with each other.

   Deliberately NOT a full serialization of app state -- a frame only marks the KIND of thing
   that's open (a sheet, a Menu section, a group's detail), never nested more than one level deep
   per kind (matches how those screens already work: you can't open a second Menu section from
   inside one, or a second group from inside a group's detail). The actual "what to reset when
   this frame is popped" logic lives with whoever pushed it (sheet.ts's closeSheet(), events.ts's
   navigateBack()) -- this module only owns the stack itself, kept dependency-free on purpose so
   it's trivial to unit-test in isolation (push some frames, pop them, check what comes back). */
export type NavFrameType = 'sheet' | 'menu-section' | 'group-detail';
export interface NavFrame { type: NavFrameType; }

let stack: NavFrame[] = [];

export function navPush(frame: NavFrame){ stack.push(frame); }
export function navPop(): NavFrame | null { return stack.length ? stack.pop()! : null; }
export function navPeek(): NavFrame | null { return stack.length ? stack[stack.length-1] : null; }
export function navDepth(): number { return stack.length; }
export function navClear(){ stack.length = 0; }
// Pops the top frame only if it's the given type -- lets a close function (closeSheet(), say)
// call this unconditionally without risking popping an unrelated frame if it's ever invoked
// when nothing of that type was actually on top (defensive, keeps the stack always accurate).
export function navPopIfTop(type: NavFrameType): boolean {
  if(stack.length && stack[stack.length-1].type===type){ stack.pop(); return true; }
  return false;
}
// Removes every frame of a given type, wherever it sits in the stack -- used by "reset this tab
// to its default" (double-tap the active tab): a 'menu-section'/'group-detail' frame only ever
// exists while that tab is the active one, so this is exactly "close whatever's open in the
// CURRENT tab" without needing to know how many frames deep it goes.
export function navClearType(type: NavFrameType){
  stack = stack.filter(f=>f.type!==type);
}
// Read-only copy for tests/debugging -- never hand out the live array itself, so nothing outside
// this module can mutate the stack except through the functions above.
export function navStackSnapshot(): NavFrame[] { return stack.slice(); }
