-- XPro: progres tersambung ke tugas.
--  * prj_milestones.progress_auto = 1 bila tahapan punya tugas: progres dihitung dari tugasnya
--    (rata-rata tertimbang estimasi jam; tugas selesai = 100%). Tanpa tugas → tetap manual.
--  * prj_projects.progress_pct: progres fisik tersimpan (satu sumber untuk daftar, detail, dashboard,
--    roadmap) = Σ(bobot × progres tahapan) / Σ(bobot); bobot 0 semua → rata-rata biasa;
--    tanpa tahapan → rata-rata progres tugas proyek.
-- Idempoten: kolom ditambah lewat information_schema; pengisian ulang aman diulang.
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prj_milestones' AND COLUMN_NAME = 'progress_auto');
SET @ddl := IF(@c1 = 0, 'ALTER TABLE prj_milestones ADD COLUMN progress_auto tinyint(1) NOT NULL DEFAULT 0 AFTER progress_pct', 'SELECT 1');
PREPARE xpro_stmt FROM @ddl;
EXECUTE xpro_stmt;
DEALLOCATE PREPARE xpro_stmt;

SET @c2 := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prj_projects' AND COLUMN_NAME = 'progress_pct');
SET @ddl := IF(@c2 = 0, 'ALTER TABLE prj_projects ADD COLUMN progress_pct decimal(7,2) NULL', 'SELECT 1');
PREPARE xpro_stmt FROM @ddl;
EXECUTE xpro_stmt;
DEALLOCATE PREPARE xpro_stmt;

UPDATE prj_milestones m
JOIN (
  SELECT milestone_id,
         SUM(w * p) / SUM(w) AS prog
    FROM (SELECT milestone_id,
                 CASE WHEN estimate_hours > 0 THEN estimate_hours ELSE 1 END AS w,
                 CASE WHEN completed_at IS NOT NULL THEN 100 ELSE LEAST(100, GREATEST(0, progress_pct)) END AS p
            FROM prj_tasks WHERE milestone_id IS NOT NULL) t
   GROUP BY milestone_id
) x ON x.milestone_id = m.id
SET m.progress_pct = ROUND(x.prog, 2),
    m.progress_auto = 1,
    m.status = CASE WHEN x.prog >= 100 THEN 'done' WHEN x.prog > 0 THEN 'in_progress' ELSE m.status END;

UPDATE prj_projects p
SET p.progress_pct = ROUND(COALESCE(
  (SELECT CASE WHEN SUM(m.weight_pct) > 0
               THEN SUM(m.weight_pct * m.progress_pct) / SUM(m.weight_pct)
               ELSE AVG(m.progress_pct) END
     FROM prj_milestones m WHERE m.project_id = p.id HAVING COUNT(*) > 0),
  (SELECT SUM(CASE WHEN t.estimate_hours > 0 THEN t.estimate_hours ELSE 1 END
              * CASE WHEN t.completed_at IS NOT NULL THEN 100 ELSE LEAST(100, GREATEST(0, t.progress_pct)) END)
          / SUM(CASE WHEN t.estimate_hours > 0 THEN t.estimate_hours ELSE 1 END)
     FROM prj_tasks t WHERE t.project_id = p.id AND t.backlog = 0 HAVING COUNT(*) > 0),
  0), 2);
