package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenNormalizeAutoGroupsPreservesPriorityAndRemovesDuplicates(t *testing.T) {
	token := Token{
		Group:      "default",
		AutoGroups: " premium, economy,premium, ,image ",
	}

	require.NoError(t, token.NormalizeAutoGroups())
	assert.Equal(t, "auto", token.Group)
	assert.Equal(t, "premium,economy,image", token.AutoGroups)
	assert.Equal(t, []string{"premium", "economy", "image"}, token.GetAutoGroups())
}

func TestTokenNormalizeAutoGroupsRejectsOversizedConfiguration(t *testing.T) {
	groups := make([]string, maxTokenAutoGroups+1)
	for index := range groups {
		groups[index] = fmt.Sprintf("group-%d", index)
	}
	token := Token{AutoGroups: strings.Join(groups, ",")}

	require.Error(t, token.NormalizeAutoGroups())
}
