import { useState } from 'react';

export default function YouTubeDownload() {
  const [channelUrl, setChannelUrl] = useState('https://www.youtube.com/@veritasium');
  const [maxVideos, setMaxVideos] = useState(10);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(10);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [resultDismissed, setResultDismissed] = useState(false);

  const handleDownload = async () => {
    setError('');
    setResult(null);
    setResultDismissed(false);
    setLoading(true);
    setProgress(0);
    const requestedMax = Math.min(100, Math.max(1, maxVideos));
    setProgressTotal(2 * requestedMax);
    setProgressMessage('Starting...');
    try {
      const res = await fetch('/api/youtube/channel/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: channelUrl.trim(), maxVideos: Math.min(100, Math.max(1, maxVideos)) }),
      });
      if (!res.ok) {
        const t = await res.text();
        let errMsg = res.statusText;
        try {
          const j = JSON.parse(t);
          errMsg = j.error || errMsg;
        } catch {
          errMsg = t || errMsg;
        }
        throw new Error(errMsg);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split(/\n\n+/);
        buffer = events.pop() || '';
        for (const event of events) {
          const dataMatch = event.match(/^data:\s*(.+)$/m);
          if (dataMatch) {
            try {
              const data = JSON.parse(dataMatch[1].trim());
              if (data.error) throw new Error(data.error);
              if (data.done) {
                setResult(data);
                setProgress((data.videos?.length || 0) * 2);
                setProgressTotal((data.videos?.length || 0) * 2);
                setProgressMessage('Done');
                break;
              }
              if (typeof data.progress === 'number') {
                setProgress(data.progress);
                setProgressMessage(data.message || '');
                if (typeof data.total === 'number') setProgressTotal(data.total);
              }
            } catch (e) {
              if (e.message && !e.message.includes('JSON')) setError(e.message);
            }
          }
        }
      }
    } catch (err) {
      setError(err.message || 'Download failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!result?.videos) return;
    const blob = new Blob([JSON.stringify({ channelId: result.channelId, videos: result.videos }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `youtube-channel-${result.channelId || 'data'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const total = Math.max(1, progressTotal);
  const progressPct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;

  return (
    <div className="youtube-download">
      <div className="youtube-download-card">
        <h2>YouTube Channel Download</h2>
        <p className="youtube-download-desc">
          Enter a YouTube channel URL to download video metadata (title, description, duration, views, likes, comments, URLs).
        </p>
        <div className="youtube-download-form">
          <input
            type="url"
            placeholder="https://www.youtube.com/@channel"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            disabled={loading}
          />
          <label className="youtube-max-label">
            Max videos:
            <input
              type="number"
              min={1}
              max={100}
              value={maxVideos}
              onChange={(e) => setMaxVideos(parseInt(e.target.value, 10) || 10)}
              disabled={loading}
            />
          </label>
          <button type="button" onClick={handleDownload} disabled={loading}>
            {loading ? 'Downloading…' : 'Download Channel Data'}
          </button>
        </div>
        {error && <p className="youtube-download-error">{error}</p>}
        {loading && (
          <div className="youtube-progress-wrap">
            <div className="youtube-progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
              <div className="youtube-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="youtube-progress-text">{progressMessage} ({progressPct}%)</span>
          </div>
        )}
        {result?.videos && !loading && !resultDismissed && (
          <div className="youtube-result-card">
            <button
              type="button"
              className="youtube-result-close"
              onClick={() => setResultDismissed(true)}
              aria-label="Dismiss"
            >
              ×
            </button>
            <div className="youtube-result-body">
              <p className="youtube-result-summary">
                Downloaded {result.videos.length} video(s).
              </p>
              {result.savedTo && (
                <p className="youtube-result-path">
                  Saved to <code>public/{result.savedTo}</code>
                </p>
              )}
              <p className="youtube-result-hint">
                You can download the JSON or drag it into Chat to analyze.
              </p>
              <button type="button" onClick={handleDownloadJson} className="youtube-download-json-btn">
                Download JSON file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
