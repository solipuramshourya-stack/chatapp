export default function PlayVideoCard({ video }) {
  if (!video?.video_url) return null;
  const { title, thumbnail_url, video_url, view_count } = video;
  const views = typeof view_count === 'number' ? view_count.toLocaleString() : view_count;

  return (
    <div className="play-video-card-wrap">
      <div className="play-video-card-label">YouTube Video</div>
      <div
        className="play-video-card"
        role="button"
        tabIndex={0}
        onClick={() => window.open(video_url, '_blank', 'noopener,noreferrer')}
        onKeyDown={(e) => e.key === 'Enter' && window.open(video_url, '_blank', 'noopener,noreferrer')}
      >
        <div className="play-video-card-thumb">
          {thumbnail_url ? (
            <img src={thumbnail_url} alt="" />
          ) : (
            <div className="play-video-card-placeholder">▶</div>
          )}
          <div className="play-video-card-play-icon" aria-hidden>▶</div>
        </div>
        <div className="play-video-card-info">
          <h4 className="play-video-card-title">{title || 'Video'}</h4>
          {views && <span className="play-video-card-views">{views} views</span>}
          <span className="play-video-card-hint">Click to open on YouTube</span>
        </div>
      </div>
    </div>
  );
}
