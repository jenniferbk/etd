// Per-episode descriptors saved with a diagram (one diagram = one episode).
// All fields optional; discipline and clip are free text.
export interface EpisodeFields {
  status?: 'vetted' | 'not vetted';
  sgwc?: 'SG' | 'WC';
  discipline?: string;
  clip?: string;
}
