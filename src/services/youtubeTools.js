// YouTube channel JSON chat tools. Tool names must match grading: generateImage, plot_metric_vs_time, play_video, compute_stats_json

export const YOUTUBE_TOOL_DECLARATIONS = [
  {
    name: 'generateImage',
    description:
      'Generate an image from a text prompt and an optional anchor/reference image. Use when the user wants to create or edit an image. The user may attach an image as reference. Returns the generated image to display in chat; user can download it or click to enlarge.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'Text description of the image to generate (e.g. "a sunset over mountains in watercolor style").',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'plot_metric_vs_time',
    description:
      'Plot a numeric field (e.g. view_count, like_count, comment_count, duration) vs time for the channel videos. Use when the user asks for a trend over time, "plot X vs time", or time-series. The chart is displayed in the chat and can be enlarged and downloaded.',
    parameters: {
      type: 'OBJECT',
      properties: {
        metric_field: {
          type: 'STRING',
          description:
            'Exact field name from the channel JSON: view_count, like_count, comment_count, duration (or duration_seconds), etc.',
        },
      },
      required: ['metric_field'],
    },
  },
  {
    name: 'play_video',
    description:
      'Show a clickable video card (title + thumbnail) that opens the YouTube video in a new tab. The user can specify which video by: title (e.g. "the asbestos video"), ordinal (e.g. "first video", "second video"), or "most viewed". Use when the user says "play", "open", or "watch" a video.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: {
          type: 'STRING',
          description:
            'How to pick the video: "first", "second", "third", etc.; "most viewed"; or a substring of the video title (e.g. "asbestos").',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'compute_stats_json',
    description:
      'Compute mean, median, std, min, and max for a numeric field in the channel JSON. Use when the user asks for statistics, average, distribution, or summary of a numeric column (e.g. view_count, like_count, comment_count, duration).',
    parameters: {
      type: 'OBJECT',
      properties: {
        field: {
          type: 'STRING',
          description:
            'Exact numeric field name: view_count, like_count, comment_count, duration_seconds, etc.',
        },
      },
      required: ['field'],
    },
  },
];

// Parse ISO 8601 duration (e.g. PT15M33S) to seconds
function parseDuration(s) {
  if (s == null || typeof s !== 'string') return null;
  const match = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return null;
  const h = parseInt(match[1], 10) || 0;
  const m = parseInt(match[2], 10) || 0;
  const sec = parseInt(match[3], 10) || 0;
  return h * 3600 + m * 60 + sec;
}

function resolveField(videos, name) {
  if (!videos?.length || !name) return name;
  const first = videos[0];
  const keys = Object.keys(first);
  if (keys.includes(name)) return name;
  const norm = (s) => s.toLowerCase().replace(/[\s_-]+/g, '');
  const target = norm(name);
  return keys.find((k) => norm(k) === target) || name;
}

function numericValues(videos, field) {
  const key = resolveField(videos, field);
  return videos
    .map((v) => {
      const val = v[key];
      if (field === 'duration' || key === 'duration') return parseDuration(val);
      const n = typeof val === 'number' && !isNaN(val) ? val : parseFloat(val);
      return isNaN(n) ? null : n;
    })
    .filter((v) => v != null);
}

function median(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function executeYoutubeTool(toolName, args, videos, generateImageFn = null) {
  const list = videos || [];

  switch (toolName) {
    case 'compute_stats_json': {
      const field = resolveField(list, args.field);
      const vals = numericValues(list, field);
      if (vals.length === 0)
        return {
          error: `No numeric values for field "${field}". Try: view_count, like_count, comment_count, or duration.`,
        };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sorted = [...vals].sort((a, b) => a - b);
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return {
        field,
        count: vals.length,
        mean: +mean.toFixed(4),
        median: +median(sorted).toFixed(4),
        std: +Math.sqrt(variance).toFixed(4),
        min: Math.min(...vals),
        max: Math.max(...vals),
      };
    }

    case 'plot_metric_vs_time': {
      const metricField = resolveField(list, args.metric_field);
      const dateField = list.length && list[0].release_date != null ? 'release_date' : list[0].publishedAt != null ? 'publishedAt' : null;
      if (!dateField) return { error: 'No date field (release_date or publishedAt) in channel data.' };
      const data = list
        .map((v) => {
          const val = v[metricField];
          const num = metricField === 'duration' || String(metricField).includes('duration') ? parseDuration(val) : parseFloat(val);
          return {
            date: v[dateField] || '',
            value: num != null && !isNaN(num) ? num : null,
          };
        })
        .filter((d) => d.value != null && d.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!data.length) return { error: 'No valid date/value pairs for chart.' };
      return {
        _chartType: 'metric_vs_time',
        metricField,
        data,
      };
    }

    case 'play_video': {
      const sel = (args.selector || '').trim().toLowerCase();
      let chosen = null;
      if (/most\s*viewed|highest\s*views|top\s*view/.test(sel)) {
        const byViews = [...list].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
        chosen = byViews[0];
      } else if (/first|1st|#1/.test(sel)) {
        chosen = list[0];
      } else if (/second|2nd|#2/.test(sel)) {
        chosen = list[1];
      } else if (/third|3rd|#3/.test(sel)) {
        chosen = list[2];
      } else if (sel) {
        chosen = list.find((v) => (v.title || '').toLowerCase().includes(sel));
      }
      if (!chosen) chosen = list[0];
      if (!chosen) return { error: 'No videos in channel data.' };
      return {
        _chartType: 'play_video',
        video: {
          title: chosen.title,
          thumbnail_url: chosen.thumbnail_url,
          video_url: chosen.video_url || `https://www.youtube.com/watch?v=${chosen.video_id}`,
        },
      };
    }

    case 'generateImage': {
      if (typeof generateImageFn === 'function') {
        return generateImageFn(args.prompt);
      }
      return { error: 'Image generation not available. Pass an anchor image and prompt in chat.' };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
