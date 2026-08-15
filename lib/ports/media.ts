export interface MediaFetcher {
  fetchImage(mediaId: string): Promise<Buffer>;
}