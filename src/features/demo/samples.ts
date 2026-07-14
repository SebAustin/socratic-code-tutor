import type { MisconceptionRecord } from "@/features/session/types";

export type DemoSample = {
  id: string;
  title: string;
  eyebrow: string;
  code: string;
  lang: "python";
  expectedTag: MisconceptionRecord["category"];
  discoveryGoal: string;
};

export const SAMPLES: DemoSample[] = [
  {
    id: "off_by_one",
    title: "One step too far",
    eyebrow: "IndexError · loops",
    lang: "python",
    expectedTag: "off_by_one",
    discoveryGoal: "Compare the final loop index with the valid list positions.",
    code: `def total(nums):
    s = 0
    for i in range(len(nums)):
        s = s + nums[i + 1]
    return s

print(total([1, 2, 3]))`,
  },
  {
    id: "mutation_vs_copy",
    title: "The vanishing sword",
    eyebrow: "Lists · identity",
    lang: "python",
    expectedTag: "mutation_vs_copy",
    discoveryGoal: "Watch whether result and inventory refer to separate lists.",
    code: `def remove_first(items):
    result = items
    result.pop(0)
    return result

inventory = ["sword", "shield", "potion"]
remaining = remove_first(inventory)
print("Remaining:", remaining)
print("Original inventory:", inventory)`,
  },
  {
    id: "scope_confusion",
    title: "Three identical counters",
    eyebrow: "Closures · scope",
    lang: "python",
    expectedTag: "scope_confusion",
    discoveryGoal: "Notice when the captured loop variable is read.",
    code: `def make_counters():
    counters = []
    for i in range(3):
        def counter():
            return i
        counters.append(counter)
    return counters

fns = make_counters()
print([f() for f in fns])`,
  },
  {
    id: "loop_condition",
    title: "A search with no answer",
    eyebrow: "While loops · bounds",
    lang: "python",
    expectedTag: "loop_condition",
    discoveryGoal: "Follow i when no negative number exists.",
    code: `def find_first_negative(nums):
    i = 0
    while i < len(nums) and nums[i] >= 0:
        i += 1
    return nums[i]

print(find_first_negative([4, 2, 7, 9]))`,
  },
  {
    id: "mutable_default_arg",
    title: "Alice meets Bob's grades",
    eyebrow: "Functions · defaults",
    lang: "python",
    expectedTag: "mutable_default_arg",
    discoveryGoal: "Observe the default list across the first and second call.",
    code: `def add_grade(grade, gradebook=[]):
    gradebook.append(grade)
    return gradebook

alice = add_grade(90)
bob = add_grade(85)
print("Alice's grades:", alice)
print("Bob's grades:", bob)`,
  },
  {
    id: "type_confusion",
    title: "Numbers wearing quotes",
    eyebrow: "Types · input",
    lang: "python",
    expectedTag: "type_coercion",
    discoveryGoal: "Inspect the type of each score before addition.",
    code: `def average_score(scores):
    total = 0
    for s in scores:
        total += s
    return total / len(scores)

user_input = ["85", "90", "78"]
print(average_score(user_input))`,
  },
];

export function findSample(id: string): DemoSample | undefined {
  return SAMPLES.find((sample) => sample.id === id);
}
