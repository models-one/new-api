package model

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	sqlmysql "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"
)

const PelicanRetentionSeconds int64 = 7 * 24 * 60 * 60
const PelicanMaxImages = 20

var ErrPelicanBusy = errors.New("A test for this channel and model is already running")

// A rule is configuration; every run stores an immutable execution snapshot.
type PelicanRule struct {
	ID              int64    `json:"id" gorm:"primaryKey"`
	Name            string   `json:"name" gorm:"size:120;not null"`
	ChannelID       int      `json:"channel_id" gorm:"index;not null"`
	Model           string   `json:"model" gorm:"size:200;not null"`
	Protocol        string   `json:"protocol" gorm:"size:32;not null"`
	Prompt          LongText `json:"prompt"`
	SystemPrompt    LongText `json:"system_prompt"`
	Parameters      LongText `json:"parameters"`
	IntervalSeconds int64    `json:"interval_seconds" gorm:"not null"`
	Enabled         bool     `json:"enabled"`
	Published       bool     `json:"published"`
	Revision        int      `json:"revision" gorm:"not null"`
	NextRunAt       int64    `json:"next_run_at" gorm:"index;not null"`
	CreatedAt       int64    `json:"created_at" gorm:"not null"`
	UpdatedAt       int64    `json:"updated_at" gorm:"not null"`
}

type PelicanRun struct {
	ID            string   `json:"id" gorm:"size:64;primaryKey"`
	RuleID        int64    `json:"rule_id" gorm:"index;not null"`
	CollectionKey string   `json:"collection_key" gorm:"size:64;index:idx_pelican_collection_time,priority:1;not null"`
	ChannelID     int      `json:"channel_id" gorm:"index;not null"`
	ChannelName   string   `json:"channel_name" gorm:"size:200"`
	Model         string   `json:"model" gorm:"size:200;not null"`
	Protocol      string   `json:"protocol" gorm:"size:32;not null"`
	Revision      int      `json:"revision"`
	Snapshot      LongText `json:"-"`
	Status        string   `json:"status" gorm:"size:32;index;not null"`
	Trigger       string   `json:"trigger" gorm:"size:16"`
	ActiveKey     *string  `json:"-" gorm:"size:64;uniqueIndex"`
	LeaseOwner    string   `json:"-" gorm:"size:64"`
	LeaseUntil    int64    `json:"-" gorm:"index"`
	RenderPayload LongText `json:"-"`
	ServiceRunID  string   `json:"service_run_id" gorm:"size:64"`
	Artifacts     LongText `json:"artifacts"`
	Generation    LongText `json:"generation"`
	ErrorDetail   LongText `json:"error_detail"`
	CreatedAt     int64    `json:"created_at" gorm:"index;not null"`
	GeneratedAt   int64    `json:"generated_at" gorm:"index:idx_pelican_collection_time,priority:2;not null"`
	FinishedAt    int64    `json:"finished_at"`
	ExpiresAt     int64    `json:"expires_at" gorm:"index;not null"`
	NextPollAt    int64    `json:"-" gorm:"index"`
	Attempts      int      `json:"-"`
}

func PelicanCollection(channelID int, model string) string {
	return fmt.Sprintf("%x", sha256.Sum256(fmt.Appendf(nil, "%d:%s", channelID, model)))
}

func SavePelicanRule(rule *PelicanRule, expectedRevision int) error {
	now := time.Now().Unix()
	if rule.ID == 0 {
		rule.Revision = 1
		rule.CreatedAt = now
		rule.UpdatedAt = now
		if rule.Enabled && rule.IntervalSeconds > 0 {
			rule.NextRunAt = now + rule.IntervalSeconds
		}
		return DB.Create(rule).Error
	}
	return pelicanTransaction(func(tx *gorm.DB) error {
		var current PelicanRule
		if err := lockForUpdate(tx).First(&current, rule.ID).Error; err != nil {
			return err
		}
		if current.Revision != expectedRevision {
			return errors.New("The rule changed; reload before saving")
		}
		rule.CreatedAt = current.CreatedAt
		rule.UpdatedAt = now
		rule.Revision = current.Revision + 1
		if rule.Enabled && rule.IntervalSeconds > 0 {
			rule.NextRunAt = now + rule.IntervalSeconds
		} else {
			rule.NextRunAt = 0
		}
		result := tx.Model(&PelicanRule{}).Where("id = ? AND revision = ?", rule.ID, expectedRevision).Select("*").Updates(rule)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return errors.New("The rule changed; reload before saving")
		}
		return nil
	})
}

// A nullable unique active key serializes a channel/model across all rules and
// masters. The slot is released only on a terminal state; an ambiguous model
// generation is never placed back on the queue.
func EnqueuePelicanRun(ruleID int64, scheduled bool, now int64) (*PelicanRun, error) {
	var run *PelicanRun
	err := pelicanTransaction(func(tx *gorm.DB) error {
		run = nil
		var rule PelicanRule
		if err := lockForUpdate(tx).First(&rule, ruleID).Error; err != nil {
			return err
		}
		if scheduled && (!rule.Enabled || rule.IntervalSeconds <= 0 || rule.NextRunAt > now) {
			return nil
		}
		key := PelicanCollection(rule.ChannelID, rule.Model)
		var count int64
		if err := tx.Model(&PelicanRun{}).Where("active_key = ?", key).Count(&count).Error; err != nil {
			return err
		}
		if scheduled {
			next := rule.NextRunAt + ((now-rule.NextRunAt)/rule.IntervalSeconds+1)*rule.IntervalSeconds
			if err := tx.Model(&rule).Update("next_run_at", next).Error; err != nil {
				return err
			}
		}
		if count != 0 {
			if scheduled {
				return nil
			}
			return ErrPelicanBusy
		}
		var channel Channel
		if err := tx.Select("id", "name", "status").First(&channel, rule.ChannelID).Error; err != nil {
			return err
		}
		payload, err := common.Marshal(rule)
		if err != nil {
			return err
		}
		id, err := common.GenerateRandomCharsKey(32)
		if err != nil {
			return err
		}
		trigger := "manual"
		if scheduled {
			trigger = "scheduled"
		}
		run = &PelicanRun{ID: "pelican_" + id, RuleID: rule.ID, CollectionKey: key, ChannelID: rule.ChannelID,
			ChannelName: channel.Name, Model: rule.Model, Protocol: rule.Protocol, Revision: rule.Revision,
			Snapshot: LongText(payload), Status: "queued", Trigger: trigger, ActiveKey: &key,
			CreatedAt: now, ExpiresAt: now + PelicanRetentionSeconds, Artifacts: "[]", Generation: "{}"}
		return tx.Create(run).Error
	})
	return run, err
}

// Retry only errors that prove a database transaction was rolled back. These
// callbacks never perform model requests or any other external side effect.
// In particular, transport/commit errors with an unknown outcome are not retried.
func pelicanTransaction(fn func(*gorm.DB) error) error {
	var err error
	for attempt := range 4 {
		err = DB.Transaction(fn)
		if err == nil {
			return nil
		}
		var sqliteErr interface{ Code() int }
		var stateErr interface{ SQLState() string }
		var mysqlErr *sqlmysql.MySQLError
		retry := errors.As(err, &sqliteErr) && sqliteErr.Code()&255 == 5 ||
			errors.As(err, &stateErr) && (stateErr.SQLState() == "40001" || stateErr.SQLState() == "40P01") ||
			errors.As(err, &mysqlErr) && (mysqlErr.Number == 1213 || mysqlErr.Number == 1205)
		if !retry || attempt == 3 {
			return err
		}
		time.Sleep(time.Duration(10<<attempt) * time.Millisecond)
	}
	return err
}

func ClaimPelicanRun(id, owner string, now, timeoutSeconds int64) (*PelicanRun, error) {
	result := DB.Model(&PelicanRun{}).Where("id = ? AND status = ? AND expires_at > ?", id, "queued", now).
		Updates(map[string]any{"status": "generating", "lease_owner": owner, "lease_until": now + timeoutSeconds + 60})
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected != 1 {
		return nil, nil
	}
	var run PelicanRun
	if err := DB.First(&run, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &run, nil
}

func FinishPelicanGeneration(id, owner string, payload, generation, detail string, now int64) error {
	updates := map[string]any{"lease_owner": "", "lease_until": 0, "generated_at": now, "expires_at": now + PelicanRetentionSeconds,
		"render_payload": payload, "generation": generation, "error_detail": detail, "next_poll_at": now}
	if payload != "" {
		updates["status"] = "render_pending"
	} else {
		updates["status"] = "failed"
		updates["active_key"] = nil
		updates["finished_at"] = now
	}
	result := DB.Model(&PelicanRun{}).Where("id = ? AND status = ? AND lease_owner = ?", id, "generating", owner).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("pelican generation ownership was lost")
	}
	return nil
}

func MaintainPelicanRuns(now int64) error {
	if err := DB.Model(&PelicanRun{}).Where("status = ? AND lease_until < ?", "generating", now).
		Updates(map[string]any{"status": "failed", "active_key": nil, "lease_owner": "", "lease_until": 0,
			"finished_at": now, "error_detail": `{"code":"execution_interrupted","message":"Generation ownership expired; upstream may have charged. No automatic generation retry was made."}`}).Error; err != nil {
		return err
	}
	// Files have their own TTL on the artifact service even while new-api is down.
	return DB.Where("expires_at <= ? AND status <> ?", now, "generating").Delete(&PelicanRun{}).Error
}

func TrimPelicanCollection(collection string, now int64) error {
	var ids []string
	if err := DB.Model(&PelicanRun{}).Where("collection_key = ? AND status = ? AND expires_at > ?", collection, "succeeded", now).
		Order("generated_at desc, id desc").Pluck("id", &ids).Error; err != nil {
		return err
	}
	if len(ids) <= PelicanMaxImages {
		return nil
	}
	ids = ids[PelicanMaxImages:]
	return DB.Model(&PelicanRun{}).Where("id IN ?", ids).Updates(map[string]any{"status": "expired", "artifacts": "[]", "snapshot": "", "generation": "{}", "error_detail": "", "render_payload": ""}).Error
}
