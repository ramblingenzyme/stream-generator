import { shuffle } from "./util.mjs";

/** @typedef {{ duration: number, name: string }} Bumper */
/** @typedef {{ duration: number, bumpers: Bumper[] }} BumperProcessState */

/**
 * @param {number} targetDuration
 * @param {number} maxDuration
 * @returns {(state: BumperProcessState, bumper: Bumper) => BumperProcessState}
 */
const getBumperProcessor = (targetDuration, maxDuration) => (state, bumper) => {
  const newDuration = state.duration + bumper.duration;
  const overMaxDuration = newDuration >= maxDuration;
  const overTarget = newDuration > targetDuration;

  if (overTarget) {
    return state;
  } else if (!overMaxDuration) {
    return {
      duration: state.duration + bumper.duration,
      bumpers: state.bumpers.concat(bumper),
    };
  }
};

/**
 * @param {Array<{ name: string, duration: number }} bumpersWithDuration
 * @param {Set<{ name: string, duration: number }>} usedSet
 * @param {number} targetDuration
 * @param {number} tolerance
 * @returns {string[]}
 */
export function getBumpers(
  bumpersWithDuration,
  usedSet,
  targetDuration,
  tolerance
) {
  const maxDuration = targetDuration + tolerance;
  const minDuration = targetDuration - tolerance;

  const unusedBumpers = bumpersWithDuration.filter((b) => !usedSet.has(b));

  /** @type {BumperProcessState} */
  const result = unusedBumpers.reduce(
    getBumperProcessor(targetDuration, maxDuration),
    {
      duration: 0,
      bumpers: [],
    }
  );

  if (result.duration >= minDuration) {
    result.bumpers.forEach((bumper) => usedSet.add(bumper));
    return result.bumpers.map((b) => b.name);
  }

  /** @type {BumperProcessState} */
  const resultWithReuse = shuffle(Array.from(usedSet.values())).reduce(
    getBumperProcessor(targetDuration, maxDuration),
    result
  );

  if (resultWithReuse.duration < minDuration) {
    console.warn(
      `[WARN] Could not get bumpers between ${minDuration} and ${maxDuration} seconds. Got to ${resultWithReuse.duration}`
    );
  }

  resultWithReuse.bumpers.forEach((bumper) => {
    if (usedSet.has(bumper)) {
      usedSet.delete(bumper);
    }
    usedSet.add(bumper);
  });

  return resultWithReuse.bumpers.map((b) => b.name);
}
