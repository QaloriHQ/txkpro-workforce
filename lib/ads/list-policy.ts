export type AdListKind = "posts" | "events" | "polls" | "articles" | "comments";
export const AD_MINIMUM_LIST_ITEMS = 3;
export function adListEligible(count: number) {
  return Number.isSafeInteger(count) && count >= AD_MINIMUM_LIST_ITEMS;
}
