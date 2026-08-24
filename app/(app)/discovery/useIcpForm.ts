"use client";

import { useMemo, useState } from "react";
import { KNOWN_COMPANIES } from "@/lib/data/known-companies";
import { DEFAULT_SIZE_INDEX, SIZE_BUCKETS } from "./constants";

/**
 * Every piece of ICP form state, and the one function that turns it into the
 * payload `startDiscovery` expects.
 *
 * `DiscoveryClient` held eleven `useState` calls interleaved with 400 lines of
 * JSX, which made it hard to see what the form actually collects. Gathering them
 * here means `buildIcpParams` is the single place that decides what gets sent to
 * the engine — previously that object was assembled inline inside the click
 * handler, next to the error handling.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useIcpForm(icp: any) {
  // Geography. Maps a country name to the cities/states chosen within it;
  // `["ALL"]` means the whole country.
  const [selectedGeo, setSelectedGeo] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    if (icp?.countries?.length) {
      icp.countries.forEach((c: string) => {
        initial[c] = ["ALL"];
      });
    } else {
      initial["United States"] = ["ALL"];
    }
    return initial;
  });

  const [industries, setIndustries] = useState<Record<string, boolean>>(() =>
    icp?.industries?.length > 0
      ? icp.industries.reduce(
          (acc: Record<string, boolean>, ind: string) => ({ ...acc, [ind]: true }),
          {}
        )
      : { SaaS: true, "E-commerce": true }
  );

  const [isSizeEnabled, setIsSizeEnabled] = useState(true);
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX);

  // Narrows the category itself, e.g. "DTC skincare" rather than just E-commerce.
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([]);
  const [excludeInput, setExcludeInput] = useState("");

  /** Big players worth excluding, deduped across whichever industries are checked. */
  const suggestedExclusions = useMemo(() => {
    const activeIndustries = Object.keys(industries).filter((k) => industries[k]);
    const seen = new Set<string>();
    const merged: { name: string; domain: string }[] = [];
    for (const ind of activeIndustries) {
      for (const company of KNOWN_COMPANIES[ind] || []) {
        if (!seen.has(company.name)) {
          seen.add(company.name);
          merged.push(company);
        }
      }
    }
    return merged;
  }, [industries]);

  const addKeyword = () => {
    const trimmed = keywordInput.trim();
    if (trimmed && !keywords.includes(trimmed)) setKeywords((prev) => [...prev, trimmed]);
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) =>
    setKeywords((prev) => prev.filter((k) => k !== kw));

  const addExclude = (value?: string) => {
    const trimmed = (value ?? excludeInput).trim();
    if (trimmed && !excludeKeywords.includes(trimmed)) {
      setExcludeKeywords((prev) => [...prev, trimmed]);
    }
    if (!value) setExcludeInput("");
  };

  const removeExclude = (name: string) =>
    setExcludeKeywords((prev) => prev.filter((k) => k !== name));

  const toggleSuggestedExclude = (name: string) =>
    excludeKeywords.includes(name) ? removeExclude(name) : addExclude(name);

  const selectAllSuggested = () =>
    setExcludeKeywords((prev) => {
      const next = [...prev];
      for (const c of suggestedExclusions) {
        if (!next.includes(c.name)) next.push(c.name);
      }
      return next;
    });

  const removeCountry = (countryName: string) =>
    setSelectedGeo((prev) => {
      const next = { ...prev };
      delete next[countryName];
      return next;
    });

  const setCountryLocations = (countryName: string, locations: string[]) =>
    setSelectedGeo((prev) => ({ ...prev, [countryName]: locations }));

  const toggleIndustry = (industry: string) =>
    setIndustries((prev) => ({ ...prev, [industry]: !prev[industry] }));

  /** The exact shape `startDiscovery` — and behind it `runDiscoveryEngine` — reads. */
  const buildIcpParams = () => ({
    countries: selectedGeo,
    industries: Object.keys(industries).filter((k) => industries[k]),
    size: isSizeEnabled ? SIZE_BUCKETS[sizeIndex] : null,
    keywords,
    excludeKeywords,
  });

  /** A run with no geography would search the entire world; the button is disabled for it. */
  const hasGeography = Object.keys(selectedGeo).length > 0;

  return {
    selectedGeo,
    removeCountry,
    setCountryLocations,
    industries,
    toggleIndustry,
    isSizeEnabled,
    setIsSizeEnabled,
    sizeIndex,
    setSizeIndex,
    keywords,
    keywordInput,
    setKeywordInput,
    addKeyword,
    removeKeyword,
    excludeKeywords,
    excludeInput,
    setExcludeInput,
    addExclude,
    removeExclude,
    suggestedExclusions,
    toggleSuggestedExclude,
    selectAllSuggested,
    buildIcpParams,
    hasGeography,
  };
}
