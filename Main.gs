/*
This Google Script will find matching videos on Youtube
and send them in an email digest
*/

const CONFIG = {
  emailAddress: 'attiq.jaffar@gmail.com',
  searchQueries: ["HTMX", "Asp.net core", "NET 8", ".net 9"],
  negativeWords: ['sponsored'],
  preferredVideoLanguage: 'en',
  maxVideosPerQuery: 50,
  emailAlertHour: 10,
  emailAlertTimezone: 'GMT',
};

// Helper function to calculate the date 24 hours ago
const getLast24HoursDate_ = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1); // Subtract 1 day (24 hours ago)
  return Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
};

const formatDuration = (isoDuration) => {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  
  if (!match) {
    return "Unknown"; // Fallback value if duration format is invalid
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours > 0 
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Function to fetch videos and their durations
const fetchYouTubeVideos_ = (query, lastRunDate) => {
  const searchResults = YouTube.Search.list(['snippet'], {
    maxResults: CONFIG.maxVideosPerQuery,
    publishedAfter: lastRunDate,
    relevanceLanguage: CONFIG.preferredVideoLanguage,
    q: query,
    type: ['video'],
    fields: 'items(id(videoId),snippet(title, channelTitle, channelId))',
  });

  const videoIds = searchResults.items.map((item) => item.id.videoId).join(',');
  if (!videoIds) return []; // No videos found

  const videoDetails = YouTube.Videos.list(['contentDetails'], {
    id: videoIds,
    fields: 'items(id,contentDetails(duration))',
  });

  const durations = videoDetails.items.reduce((map, item) => {
    map[item.id] = item.contentDetails.duration;
    return map;
  }, {});

  return searchResults.items
    .map((item) => {
      const { id: { videoId } = {}, snippet: { title, channelTitle, channelId } = {} } = item;
      const duration = durations[videoId] ? formatDuration(durations[videoId]) : 'N/A';
      return { videoId, title, channelTitle, channelId, duration };
    })
    .filter(({ title }) => {
      // Exact match using a regular expression
      const exactMatchRegex = new RegExp(`\\b${query}\\b`, 'i');
      const isExactMatch = exactMatchRegex.test(title);

      // Check for negative words
      const containsNegativeWords = CONFIG.negativeWords.some((word) =>
        title.toLowerCase().includes(word.toLowerCase())
      );

      return isExactMatch && !containsNegativeWords;
    });
};

// Function to trigger alerts and send emails
const triggerYouTubeAlerts = () => {
  const lastRunDate = getLast24HoursDate_(); // Fetch videos from the last 24 hours
  const videos = CONFIG.searchQueries
    .map((query) => fetchYouTubeVideos_(query, lastRunDate))
    .reduce((arr, input) => arr.concat(input), []);

  if (videos.length) {
    const template = HtmlService.createTemplateFromFile('index');
    template.videos = videos;
    MailApp.sendEmail(CONFIG.emailAddress, `[YouTube Alerts] ${videos.length} videos found`, '', {
      name: 'YouTube Email Alerts',
      htmlBody: template.evaluate().getContent(),
    });
  }
};

// Function to initialize the script and create a time-based trigger
const initialize = () => {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i += 1) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger(triggerYouTubeAlerts.name)
    .timeBased()
    .everyDays(1)
    .atHour(parseInt(CONFIG.emailAlertHour, 10))
    .inTimezone(CONFIG.emailAlertTimezone)
    .create();

  triggerYouTubeAlerts();
};
