package system_setting

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const PelicanServiceURLOptionKey = "PelicanServiceURL"
const PelicanConnectionOptionKey = "PelicanConnectionSecret"
const PelicanTestTokenOptionKey = "PelicanTestTokenID"

type PelicanConnection struct {
	URL         string `json:"url"`
	SealedToken string `json:"sealed_token,omitempty"`
}

func PelicanConnectionSnapshot() (PelicanConnection, error) {
	common.OptionMapRWMutex.RLock()
	stored := common.OptionMap[PelicanConnectionOptionKey]
	legacyURL := common.OptionMap[PelicanServiceURLOptionKey]
	common.OptionMapRWMutex.RUnlock()
	var connection PelicanConnection
	if stored != "" {
		if err := common.UnmarshalJsonStr(stored, &connection); err != nil {
			return connection, errors.New("Invalid stored artifact service connection")
		}
	} else {
		connection.URL = legacyURL
	}
	if connection.URL == "" && connection.SealedToken == "" {
		connection.URL = os.Getenv("PELICAN_SERVICE_URL")
	}
	var err error
	connection.URL, err = NormalizePelicanServiceURL(connection.URL)
	return connection, err
}

func PelicanTestTokenID() int {
	common.OptionMapRWMutex.RLock()
	saved := common.OptionMap[PelicanTestTokenOptionKey]
	common.OptionMapRWMutex.RUnlock()
	if saved == "" {
		return common.GetEnvOrDefault("PELICAN_TEST_TOKEN_ID", 0)
	}
	id, _ := strconv.Atoi(saved)
	return id
}

func (c PelicanConnection) Token() (string, error) {
	if c.SealedToken == "" {
		return os.Getenv("PELICAN_SERVICE_TOKEN"), nil
	}
	aead, err := pelicanConnectionCipher()
	if err != nil {
		return "", err
	}
	sealed, err := base64.RawStdEncoding.DecodeString(c.SealedToken)
	if err != nil {
		return "", errors.New("Cannot decrypt the artifact service token")
	}
	raw, err := aead.Open(nil, nil, sealed, []byte(c.URL))
	if err != nil {
		return "", errors.New("Cannot decrypt the artifact service token")
	}
	return string(raw), nil
}

func (c *PelicanConnection) SealToken(token string) error {
	aead, err := pelicanConnectionCipher()
	if err != nil {
		return err
	}
	c.SealedToken = base64.RawStdEncoding.EncodeToString(aead.Seal(nil, nil, []byte(token), []byte(c.URL)))
	return nil
}

func pelicanConnectionCipher() (cipher.AEAD, error) {
	secret := os.Getenv("CRYPTO_SECRET")
	if secret == "" {
		secret = os.Getenv("SESSION_SECRET")
	}
	if len(secret) < 32 {
		return nil, errors.New("Configure a stable CRYPTO_SECRET or SESSION_SECRET of at least 32 characters before saving an artifact service token")
	}
	key, err := hkdf.Key(sha256.New, []byte(secret), nil, "new-api/pelican-connection/v1", 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCMWithRandomNonce(block)
}

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
	connection, err := PelicanConnectionSnapshot()
	return connection.URL, err
}
