import { shuffle } from "./util.mjs";

export interface Bumper {
  name: string;
  duration: number;
}

interface BumperProcessState {
  duration: number;
  bumpers: Bumper[];
}

const getBumperProcessor =
  (targetDuration: number, maxDuration: number) =>
  (state: BumperProcessState, bumper: Bumper): BumperProcessState => {
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
    } else {
      return state;
    }
  };

export function getBumpers(
  bumpers: Bumper[],
  usedSet: Set<Bumper>,
  targetDuration: number,
  tolerance: number
) {
  const maxDuration = targetDuration + tolerance;
  const minDuration = targetDuration - tolerance;

  const unusedBumpers = bumpers.filter((b) => !usedSet.has(b));

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
