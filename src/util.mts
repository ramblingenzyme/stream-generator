import fs from "fs/promises";
import { Dirent } from "fs";

export const minZip = <T,>(...arrays: T[][]): T[][] => {
  const minLength = Math.min(...arrays.map((a) => a.length));
  return Array(minLength)
    .fill(undefined)
    .map((_, i) => arrays.map((array) => array[i]));
};

export const shuffle = <T,>(array: T[]): T[] =>
  array
    .map((value) => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);

export const asyncFilter = async <T,>(
  arr: T[],
  asyncFn: (value: T, index: number, array: T[]) => boolean
): Promise<T[]> => {
  const results = await Promise.all(arr.map(asyncFn));
  return arr.filter((_, i) => results[i]);
};

export const dirMap = async <T,>(
  dirPath: string,
  asyncFn: (d: Dirent) => Promise<T>
): Promise<T[]> => {
  const dir = await fs.opendir(dirPath);
  let results = [];

  for await (const entry of dir) {
    results.push(asyncFn(entry));
  }

  return Promise.all(results);
};
