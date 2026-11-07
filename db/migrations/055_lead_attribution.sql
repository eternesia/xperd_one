-- Atribusi prospek ke konten: dari postingan atau kampanye mana sebuah prospek berasal.
ALTER TABLE crm_leads
  ADD COLUMN source_post_id char(36) NULL,
  ADD COLUMN source_campaign_id char(36) NULL,
  ADD KEY ix_crm_leads_source_post (workspace_id, source_post_id),
  ADD KEY ix_crm_leads_source_campaign (workspace_id, source_campaign_id),
  ADD CONSTRAINT fk_crm_leads_source_post FOREIGN KEY (source_post_id) REFERENCES crm_scheduled_posts (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_crm_leads_source_campaign FOREIGN KEY (source_campaign_id) REFERENCES crm_campaigns (id) ON DELETE SET NULL;
