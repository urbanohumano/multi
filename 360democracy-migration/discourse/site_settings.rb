# frozen_string_literal: true

# Site settings for the 360 Democracy Discourse. Run once after bootstrap, and again after
# any rebuild that resets settings:
#
#   cd /var/discourse && ./launcher enter app
#   cd /var/www/discourse && su discourse -c 'bundle exec rails runner /shared/import/site_settings.rb'
#
# Backup credentials come from environment variables so the file can live in a repository.

settings = {
  title: "360 Democracy",
  default_locale: "en",
  login_required: true,              # private community, like Circle
  invite_only: true,                 # members join through invitation links
  enable_local_logins: true,
  external_system_avatars_enabled: false,  # keep avatar generation on the VPS (EU hosting)
  default_email_digest_frequency: 10_080,  # minutes: weekly summary, like Circle's digest
  reply_by_email_enabled: false,     # no POP3 mailbox; members reply on the web
  chat_enabled: true,
  calendar_enabled: true,
  discourse_post_event_enabled: true,
  download_remote_images_to_local: true,   # copy images while Circle still serves them
  max_image_size_kb: 8192,
  max_attachment_size_kb: 10_240,
  backup_frequency: 1,
}

if ENV["BACKUP_S3_BUCKET"]
  settings.merge!(
    backup_location: "s3",
    s3_backup_bucket: ENV["BACKUP_S3_BUCKET"],
    s3_endpoint: ENV.fetch("BACKUP_S3_ENDPOINT"),      # e.g. https://s3.fr-par.scw.cloud
    s3_region: ENV.fetch("BACKUP_S3_REGION", "fr-par"),
    s3_access_key_id: ENV.fetch("BACKUP_S3_ACCESS_KEY"),
    s3_secret_access_key: ENV.fetch("BACKUP_S3_SECRET_KEY"),
  )
end

settings.each do |name, value|
  unless SiteSetting.respond_to?("#{name}=")
    puts "skip #{name}: unknown setting on this Discourse version"
    next
  end
  SiteSetting.public_send("#{name}=", value)
  puts "#{name} = #{value.is_a?(String) && name.to_s.include?('secret') ? '***' : value}"
end
