import fs from "fs/promises";
import { Dirent } from "fs";

/**
 * @template T
 * @param  {...Array<T>} arrays
 * @returns {Array<Array<T>>}
 */
export const minZip = (...arrays) => {
  const minLength = Math.min(...arrays.map((a) => a.length));
  return Array(minLength)
    .fill()
    .map((_, i) => arrays.map((array) => array[i]));
};

export const shuffle = (array) =>
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
export const asyncFilter = async (arr, asyncFn) => {
  const results = await Promise.all(arr.map(asyncFn));
  return arr.filter((_, i) => results[i]);
};

/**
 * @template T
 * @template R
 * @param {Array<T>} arr
 * @param {(entry: T, index: number, array: Array<T>) => Promise<R[]> | Promise<R>} asyncFn
 * @returns {Promise<R[]>}
 */
export const asyncFlatMap = async (arr, asyncFn) => {
  const results = await Promise.all(arr.map(asyncFn));
  return results.flat();
};

/**
 * @template T
 * @param {string} dirPath
 * @param {(d: Dirent) => T} asyncFn
 * @returns {Promise<T[]>}
 */
export const dirMap = async (dirPath, asyncFn) => {
  const dir = await fs.opendir(dirPath);
  let results = [];

  for await (const entry of dir) {
    results.push(asyncFn(entry));
  }

  return Promise.all(results);
};
