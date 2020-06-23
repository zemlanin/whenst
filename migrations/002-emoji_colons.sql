BEGIN TRANSACTION;

UPDATE slack_preset
  SET status_emoji = trim(status_emoji, ':')
  WHERE status_emoji ILIKE ':%:';

END TRANSACTION;
