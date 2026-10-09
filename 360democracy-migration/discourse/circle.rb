# frozen_string_literal: true

# Discourse import script for a Circle community converted with convert_circle_export.py.
#
# Copy this file to script/import_scripts/circle.rb inside the Discourse container and the
# converted CSVs to /shared/import/circle (or point CIRCLE_IMPORT_DIR somewhere else), then:
#
#   cd /var/discourse && ./launcher enter app
#   cd /var/www/discourse
#   su discourse -c 'CIRCLE_IMPORT_DIR=/shared/import/circle bundle exec ruby script/import_scripts/circle.rb'
#
# The script is idempotent: ImportScripts::Base remembers every imported id, so re-running it
# after a fresh export only adds what is new (the "delta" step before the cut-over).
#
# NOT YET RUN AGAINST A LIVE DISCOURSE: first run it on the pilot instance with the sample data.

require "csv"
require File.expand_path(File.dirname(__FILE__) + "/base.rb")

class ImportScripts::Circle < ImportScripts::Base
  BATCH_SIZE = 1000

  def initialize
    super
    @path = ENV["CIRCLE_IMPORT_DIR"] || "/shared/import/circle"
    %w[users.csv categories.csv topics.csv replies.csv].each do |name|
      raise "missing #{File.join(@path, name)}" unless File.exist?(File.join(@path, name))
    end
  end

  def execute
    import_users
    import_categories
    import_topics
    import_replies
  end

  def rows(name)
    CSV.read(File.join(@path, name), headers: true, encoding: "bom|utf-8").map(&:to_h)
  end

  def timestamp(value)
    value.to_s.empty? ? nil : Time.parse(value)
  end

  def import_users
    puts "", "Importing users..."
    users = rows("users.csv")
    create_users(users, total: users.size) do |row|
      {
        id: row["id"],
        email: row["email"],
        username: row["username"],
        name: row["name"].to_s.empty? ? nil : row["name"],
        created_at: timestamp(row["created_at"]),
        active: true,
        approved: true,
        post_create_action: proc { |user| tag_user(user, row["tags"]) },
      }
    end
  end

  # Circle member tags become user custom fields so moderators can find people by group.
  def tag_user(user, tags)
    return if tags.to_s.strip.empty?
    user.custom_fields["circle_tags"] = tags.split(",").map(&:strip).reject(&:empty?).join(", ")
    user.save_custom_fields
  end

  def import_categories
    puts "", "Importing categories..."
    categories = rows("categories.csv")
    parents, children = categories.partition { |row| row["parent_id"].to_s.empty? }
    (parents + children).each do |row|
      create_category(
        {
          id: row["id"],
          name: row["name"],
          description: row["description"],
          parent_category_id: row["parent_id"].to_s.empty? ? nil : category_id_from_imported_category_id(row["parent_id"]),
          read_restricted: row["read_restricted"].to_s == "true",
        },
        row["id"],
      )
    end
  end

  def import_topics
    puts "", "Importing topics..."
    topics = rows("topics.csv")
    create_posts(topics, total: topics.size) do |row|
      {
        id: row["id"],
        user_id: user_id_from_imported_user_id(row["user_id"]) || Discourse::SYSTEM_USER_ID,
        title: row["title"],
        category: category_id_from_imported_category_id(row["category_id"]),
        raw: row["raw"],
        created_at: timestamp(row["created_at"]),
      }
    end
  end

  def import_replies
    puts "", "Importing replies..."
    replies = rows("replies.csv")
    create_posts(replies, total: replies.size) do |row|
      topic = topic_lookup_from_imported_post_id(row["topic_import_id"])
      next if topic.nil?

      post = {
        id: row["id"],
        user_id: user_id_from_imported_user_id(row["user_id"]) || Discourse::SYSTEM_USER_ID,
        topic_id: topic[:topic_id],
        raw: row["raw"],
        created_at: timestamp(row["created_at"]),
      }
      unless row["parent_import_id"].to_s.empty?
        parent = topic_lookup_from_imported_post_id(row["parent_import_id"])
        post[:reply_to_post_number] = parent[:post_number] if parent
      end
      post
    end
  end
end

ImportScripts::Circle.new.perform
