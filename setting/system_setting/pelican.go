package system_setting

import (
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const PelicanServiceURLOptionKey = "PelicanServiceURL"

var ErrPelicanServiceURLInvalid = common.NewMessage("Artifact service URL must be an HTTP(S) address without credentials, query or fragment")

// NormalizePelicanServiceURL accepts an optional base address, including a path
// prefix or an internal Docker hostname. Never include rejected input in errors.
func NormalizePelicanServiceURL(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if len(value) > 2048 || strings.ContainsAny(value, "?#\\") {
		return "", ErrPelicanServiceURLInvalid
	}
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.Hostname() == "" || strings.Contains(parsed.Path, "\\") {
		return "", ErrPelicanServiceURLInvalid
	}
	if strings.HasSuffix(parsed.Host, ":") {
		return "", ErrPelicanServiceURLInvalid
	}
	if port := parsed.Port(); port != "" {
		number, err := strconv.ParseUint(port, 10, 16)
		if err != nil || number == 0 {
			return "", ErrPelicanServiceURLInvalid
		}
	}
	if strings.Contains(parsed.Hostname(), ":") || strings.HasPrefix(parsed.Host, "[") {
		if _, err := netip.ParseAddr(parsed.Hostname()); err != nil || !strings.HasPrefix(parsed.Host, "[") {
			return "", ErrPelicanServiceURLInvalid
		}
	}
	return strings.TrimRight(value, "/"), nil
}

// GetPelicanServiceURL reads the live option on every call. A blank override
// falls back to the environment; invalid addresses are never returned to callers.
func GetPelicanServiceURL() (string, error) {
	common.OptionMapRWMutex.RLock()
	value := common.OptionMap[PelicanServiceURLOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(value) == "" {
		value = os.Getenv("PELICAN_SERVICE_URL")
	}
	return NormalizePelicanServiceURL(value)
}
