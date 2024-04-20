#!/usr/bin/env node
import { execa } from "execa";
import fs from "fs/promises";
import { Dirent } from "fs";
import * as path from "path";
import { fileTypeFromFile } from "file-type";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import { AsyncLocalStorage } from "async_hooks";

import { getBumpers } from "./bumpers.mjs";
import { dirMap, minZip, shuffle } from "./util.mjs";

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
 * @param {string} path
 * @param {Dirent} dirent
 * @returns {Promise<boolean>}
 */
const getIsVideoFile = async (path, dirent) => {
  if (dirent.isFile()) {
    const result = await fileTypeFromFile(path);
    return result?.mime.startsWith("video");
  } else {
    return false;
  }
};

/**
 * @param {string} dir
 * @returns {Promise<Array<string>>}
 */
async function getVids(dir, { withDuration = false } = {}) {
  return (
    await dirMap(dir, async (d) => {
      const fullPath = path.resolve(dir, d.name);
      if (await getIsVideoFile(fullPath, d)) {
        if (withDuration) {
          return {
            name: d.name,
            duration: await getDuration(fullPath),
          };
        }
        return d.name;
      }
    })
  ).filter((x) => x !== undefined);
}

function buildBumperGetter(bumpers, resetThreshold) {
  let localBumpers = shuffle(bumpers);
  const usedSet = new Set();

  const bumpersDuration = localBumpers.reduce(
    (acc, val) => acc + val.duration,
    0
  );

  const resetUsedSet = () => {
    let usedDuration = 0;
    for (const { duration } of usedSet.values()) {
      usedDuration += duration;
    }

    const unusedDuration = bumpersDuration - usedDuration;

    if (
      unusedDuration < resetThreshold ||
      usedDuration >= bumpersDuration * 0.9
    ) {
      console.log("[DEBUG] Reset bumpers");
      usedSet.clear();
      localBumpers = shuffle(localBumpers);
    }
  };

  return (duration, tolerance) => {
    try {
      return getBumpers(localBumpers, usedSet, duration, tolerance);
    } finally {
      resetUsedSet();
    }
  };
}

/**
 *
 * @param {string[][]} playlists
 * @returns
 */
async function addBumpers(playlists) {
  const argv = getArgs();
  if (!argv.bumpersDir) {
    return playlists;
  }

  const preshowDuration = 15 * 60;
  const betweenDuration = 10 * 60;
  const tolerance = 2.5 * 60;

  /** @type Array<{ name: string, duration: number }> */
  const bumpers = shuffle(
    await getVids(argv.bumpersDir, { withDuration: true })
  );
  const bumperGetter = buildBumperGetter(bumpers, betweenDuration);

  return playlists.map((playlist) => {
    const preshowBumpers = bumperGetter(preshowDuration, tolerance);
    const withBumpers = playlist.flatMap((val, idx) =>
      playlist.length - 1 !== idx
        ? [val, ...bumperGetter(betweenDuration, tolerance)]
        : val
    );

    return [...preshowBumpers, ...withBumpers];
  });
}

async function main() {
  const argv = getArgs();

  /** @type string[][] */
  const dirVids = await Promise.all(argv._.map(getVids));

  // TODO: set max # of concurrent series & stripe them
  const playlists = minZip(...dirVids);
  const playlistsWithBumpers = await addBumpers(playlists);

  console.log(playlistsWithBumpers);

  const minVidsInDir = Math.min(...dirVids.map((vids) => vids.length));
  const maxVidsInDir = Math.max(...dirVids.map((vids) => vids.length));
  console.warn(
    `[WARN] Min directory has ${minVidsInDir} episodes, and max directory has ${maxVidsInDir}.`
  );
}

let argsContext = new AsyncLocalStorage();

function parseArgs() {
  return yargs(hideBin(process.argv))
    .option("bumpers-dir", {
      describe: "Directory with bumper vids",
      type: "string",
    })
    .parseSync();
}

function getArgs() {
  return argsContext.getStore();
}

argsContext.run(parseArgs(), () => main().catch(console.error));
