#!/usr/bin/env node
import { execa } from "execa";
import fs from "fs/promises";
import * as path from "path";
import { fileTypeFromFile } from "file-type";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";

const getDuration = async (path) => {
  const { stdout } = await execa("ffprobe", [
    "-v",
    "quiet",
    "-of",
    "json",
    "-show_format",
    path,
  ]);
  const jsonOutput = JSON.parse(stdout);

  return parseFloat(jsonOutput?.format?.duration);
};
/**
 * @template T
 * @param  {...Array<T>} arrays
 * @returns {Array<Array<T>>}
 */
const minZip = (...arrays) => {
  const minLength = Math.min(...arrays.map((a) => a.length));
  return Array(minLength)
    .fill()
    .map((_, i) => arrays.map((array) => array[i]));
};

const shuffle = (array) =>
  array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

/**
 * @template T
 * @param {Array<T>} arr
 * @param {(entry: T) => boolean} asyncFn
 * @returns {Promise<Array<T>>}
 */
const asyncFilter = async (arr, asyncFn) => {
  const results = await Promise.all(arr.map(asyncFn));

  return arr.filter((_, i) => results[i]);
};

const isVideoFile = async (path) => {
  const result = await fileTypeFromFile(path);
  return result?.mime.startsWith("video");
};

/**
 * @param {*} dir
 * @returns Promise<Array<string>>
 */
async function getVids(dir) {
  if (!dir) {
    return [];
  }
  const files = await fs.readdir(dir, { withFileTypes: true });
  const vids = await asyncFilter(files, (f) => {
    if (f.isFile()) {
      return isVideoFile(path.resolve(dir, f.name));
    } else {
      return false;
    }
  });

  return vids.map((vid) => vid.name);
}

/**
 *
 * @param {Array<{ name: string, duration: number }} bumpersWithDuration
 * @param {Set<{ name: string, duration: number }>} usedSet
 * @param {number} targetDuration
 * @param {number} tolerance
 */
async function getBumpers(
  bumpersWithDuration,
  usedSet,
  targetDuration,
  tolerance
) {
  let finished = false;
  let currentDuration = 0;

  const bumpers = [];

  const maxDuration = targetDuration + tolerance;
  const minDuration = targetDuration - tolerance;

  for (const currentCandidate of bumpersWithDuration) {
    if (
      !usedSet.has(currentCandidate) &&
      currentDuration + currentCandidate.duration <= maxDuration
    ) {
      bumpers.push(currentCandidate.name);
      usedSet.add(currentCandidate);
      currentDuration += currentCandidate.duration;
    }

    if (targetDuration <= currentDuration) {
      return bumpers;
    }
  }

  if (minDuration <= currentDuration) {
    return bumpers;
  }

  const differenceRange = [
    targetDuration - currentDuration,
    maxDuration - currentDuration,
  ];

  for (const reuseCandidate of usedSet.values()) {
    if (
      differenceRange[0] < reuseCandidate.duration &&
      reuseCandidate.duration < differenceRange[1]
    ) {
      bumpers.push(reuseCandidate);
      return bumpers;
    }
  }

  console.warn(
    `[WARN] Could not get bumpers between ${minDuration} and ${maxDuration} seconds. Got to ${currentDuration}`
  );
  return bumpers;
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option("bumpers-dir", {
      describe: "Directory with bumper vids",
      type: "string",
    })
    .parseSync();

  const [bumpers, ...dirVids] = await Promise.all([
    getVids(argv.bumpersDir),
    ...argv._.map(getVids),
  ]);

  let bumpersWithDuration = shuffle(
    await Promise.all(
      bumpers.map(async (vid) => ({
        name: vid,
        duration: await getDuration(path.resolve(argv.bumpersDir, vid)),
      }))
    )
  );

  const minVidsInDir = Math.min(...dirVids.map((vids) => vids.length));
  const maxVidsInDir = Math.max(...dirVids.map((vids) => vids.length));

  console.warn(
    `[WARN] Min directory has ${minVidsInDir} episodes, and max directory has ${maxVidsInDir}.`
  );

  // TODO: set max # of concurrent series & stripe them
  const playlists = minZip(...dirVids);

  const bumpersDuration = bumpersWithDuration.reduce(
    (acc, val) => acc + val.duration,
    0
  );
  const preshowDuration = 15 * 60;
  const betweenDuration = 10 * 60;
  const tolerance = 2.5 * 60;
  const usedSet = new Set();

  const resetUsedSet = () => {
    let usedDuration = 0;
    for (const { duration } of usedSet.values()) {
      usedDuration += duration;
    }

    const unusedDuration = bumpersDuration - usedDuration;

    if (
      unusedDuration < betweenDuration ||
      usedDuration >= bumpersDuration * 0.9
    ) {
      console.log("[DEBUG] Reset bumpers");
      usedSet.clear();
      bumpersWithDuration = shuffle(bumpersWithDuration);
    }
  };

  const playlistsWithBumpers = await Promise.all(
    playlists.map(async (playlist) => {
      const preshow = await getBumpers(
        bumpersWithDuration,
        usedSet,
        preshowDuration,
        tolerance
      );
      resetUsedSet();

      const resetGetBumpers = async () => {
        const bumpers = await getBumpers(
          bumpersWithDuration,
          usedSet,
          betweenDuration,
          tolerance
        );
        resetUsedSet();
        return bumpers;
      };

      const withBumpers = await Promise.all(
        playlist.map(async (val, idx) =>
          playlist.length - 1 !== idx
            ? [val, ...(await resetGetBumpers())]
            : val
        )
      );

      return [...preshow, ...withBumpers.flat()];
    })
  );

  console.log(playlistsWithBumpers);
}

main().catch(console.error);
