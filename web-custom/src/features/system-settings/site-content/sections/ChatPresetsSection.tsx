import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SettingsSection } from '@/features/system-settings/components/SettingsSection'
import { isUsableChatTemplate } from '@/features/system-settings/site-content/chat-template'
import { OptionListEditor } from '@/features/system-settings/site-content/list-editor/OptionListEditor'
import { chatCodec, type ListEditorSpec } from '@/features/system-settings/site-content/list-editor/list-model'
import { useListSection } from '@/features/system-settings/site-content/list-editor/use-list-section'

/**
 * `/system-settings/content/chat` — the third-party chat clients offered as one-click links.
 *
 * ONE key, `Chats`, verified present in `GET /api/option/` and holding the nine seeded
 * presets on the dev server. There is no companion enable flag: the empty list is how the
 * feature is turned off.
 *
 * THE ENTRY SHAPE IS NOT NEGOTIABLE. Every entry is a single-key object,
 * `{ "<display name>": "<url template>" }`, and both ends insist on it:
 *   - `model.UpdateOption` unmarshals the value into Go's `[]map[string]string`, so a
 *     non-string value is refused with the raw Go error and the EMPTY STRING is refused
 *     outright ("unexpected end of JSON input") — the empty list must be written as `[]`,
 *     which is what `emptyValue` does. Both verified live.
 *     A REFUSAL HERE DOES NOT ROLL ANYTHING BACK, and that is why this section validates
 *     the blob itself rather than leaning on the server. `model.UpdateOption` writes the
 *     row to the database and only then calls `updateOptionMap`, so the error the client
 *     receives arrives after the stored list has already been replaced — verified live by
 *     writing `[{"a":1}]`, which answered `{success:false}` and was returned by the very
 *     next `GET /api/option/`. Unlike the four `console_setting.*` lists, whose validator
 *     runs in `controller.UpdateOption` before the write, "the server said no" is no
 *     guarantee the old presets survived. The form's own check is the only thing standing
 *     between a typo and every user losing their chat clients.
 *   - `parseChatPresets` in `@/features/chat/chat-presets` skips any entry that is not a
 *     one-key object with a string value, so a two-key entry would silently disappear from
 *     the launcher. `chatCodec` refuses to decode one rather than guessing which key was
 *     meant, and the editor says so instead of dropping it.
 *
 * The name is the object KEY, which is why it has to be unique: two presets called
 * "Cherry Studio" would collapse into one entry the moment the list was serialised.
 *
 * `/chat/$chatId` addresses a preset by its POSITION in this array. Removing an entry
 * renumbers everything after it, so a user's bookmark of `/chat/4` will land on a
 * different client. Reordering is deliberately not offered here for the same reason.
 */
export function ChatPresetsSection() {
  const { t } = useTranslation()

  const spec = useMemo<ListEditorSpec>(
    () => ({
      codec: chatCodec,
      emptyValue: '[]',
      fields: [
        {
          column: { header: t('Client'), className: 'w-56' },
          description: t('Shown on the button users press. It is also the entry’s key in the stored list, so it has to be unique.'),
          kind: 'text',
          label: t('Client name'),
          name: 'name',
          required: true,
        },
        {
          check: isUsableChatTemplate,
          checkMessage: t('This console will not open that address: a placeholder sits inside the host, so filling it in would send the user’s API key somewhere the address does not name.'),
          column: { header: t('Link template'), mono: true },
          description: t('Placeholders: {key} is the user’s API key, {address} this deployment’s address, and {cherryConfig}, {aionuiConfig} and {deepchatConfig} each expand to a whole encoded configuration blob and ignore the other two.'),
          kind: 'textarea',
          label: t('Link template'),
          name: 'template',
          placeholder: 'https://example.com/?key={key}&url={address}/v1',
          required: true,
          rows: 3,
        },
      ],
      optionKey: 'Chats',
      uniqueField: 'name',
    }),
    [t],
  )

  const section = useListSection({ spec })

  return (
    <SettingsSection
      description={t('The third-party chat clients offered as one-click links.')}
      form={section.form}
      note={(
        <>
          {t('A template that starts with http or https is opened inside the console; anything else — a cherrystudio:// link, a browser-extension keyword — is handed to the user to open themselves. Each preset is addressed by its position, so removing one shifts the links to every preset after it.')}
          {' '}
          {t('This setting is stored before the server checks it, so unlike the other lists here a refusal does not put the old presets back — whatever this page shows after a failed save is what the server now holds.')}
        </>
      )}
      saveMode="section"
      title={t('Chat presets')}
    >
      <OptionListEditor
        addLabel={t('Add a client')}
        disabled={section.disabled}
        emptyDescription={t('With no presets configured the console offers users no chat clients at all.')}
        emptyTitle={t('No chat clients configured')}
        itemNoun={t('chat client')}
        jsonDescription={t('The value exactly as the server stores it: an array of single-key objects. Anything else is refused by the gateway and ignored by the chat launcher.')}
        onChange={section.setBlob}
        spec={spec}
        tableLabel={t('Chat presets')}
        value={section.blob}
      />
    </SettingsSection>
  )
}
