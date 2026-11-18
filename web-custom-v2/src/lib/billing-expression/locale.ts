/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/**
 * An i18next language code as a locale tag the Intl APIs accept. This console's codes
 * (en, zh, zh-TW, …) are already BCP-47; anything unknown falls back to the runtime default.
 */
export function toIntlLocale(value?: string | null): string | undefined {
  if (!value) return undefined
  if (value === 'zhCN') return 'zh-CN'
  if (value === 'zhTW') return 'zh-TW'
  try {
    return Intl.getCanonicalLocales(value)[0]
  } catch {
    return undefined
  }
}
