import type { Group } from "@/domain/customer/group";

/**
 * The group's colour, worn wherever a screen names a household's group.
 *
 * Literal palette values rather than theme tokens: RED and BLUE *are* the printed cards FD hands
 * out, so this is one of the two places in the application where the colour is the datum rather
 * than a decoration of it (`docs/ui_conversion_guide.md` rule 9) — a theme may not re-map it.
 *
 * It lives here rather than beside the first screen that needed it because a meaning gets one colour
 * across the whole application, and two copies of a tint are how `/kunden` and the cards-due list
 * would come to paint the same red two different shades. The word always travels with it
 * (`de.customers.groups`): a colour is a distinction only some of the staff can make (US-03.4).
 */
export const GROUP_STYLES: Record<Group, string> = {
  RED: "border-red-600/40 bg-red-600/10",
  BLUE: "border-blue-700/40 bg-blue-700/10",
};
