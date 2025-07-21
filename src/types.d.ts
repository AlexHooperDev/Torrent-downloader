declare module "webtorrent" {
  const value: any;
  export default value;
}

declare module "ffmpeg-static" {
  const path: string | null;
  export default path;
}

// Added declaration for torrent-search-api since it lacks TypeScript types
declare module "torrent-search-api" {
  const value: any;
  export default value;
} 