/**
 * Releases and their notes on the provider's side. `ReleaseNote` (no suffix) is the client's
 * published note and stays separate.
 */
export type ReleasesParamList = {
  Releases: undefined;
  ReleaseDetail: { id: string };
  ReleaseNotes: undefined;
  ReleaseNoteDetail: { id: string };
};
