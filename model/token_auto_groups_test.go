package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Keys created by the fork's earlier multi-group feature stored their groups as
// "a,b". After migration they must parse to the same groups, in order.
func TestMigrateLegacyTokenAutoGroupsRewritesCommaSeparatedValues(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Token{}))

	stored := map[string]string{
		"legacy": "vip,default",
		"spaced": " vip , ,default ",
		"single": "vip",
		"json":   `["vip","default"]`,
		"none":   "",
	}
	want := map[string][]string{
		"legacy": {"vip", "default"},
		"spaced": {"vip", "default"},
		"single": {"vip"},
		"json":   {"vip", "default"},
		"none":   nil,
	}
	for name, autoGroups := range stored {
		require.NoError(t, db.Create(&Token{Key: name, Name: name, AutoGroups: autoGroups}).Error)
	}

	require.NoError(t, migrateLegacyTokenAutoGroups(db))

	for name, expected := range want {
		var token Token
		require.NoError(t, db.Where("name = ?", name).First(&token).Error)
		groups, err := token.GetAutoGroups()
		require.NoError(t, err, name)
		assert.Equal(t, expected, groups, name)
	}
}
