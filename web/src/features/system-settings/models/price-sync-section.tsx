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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

import { triggerModelPriceSync } from '../api'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const applyModes = ['decrease_only', 'all', 'dry_run'] as const
type ApplyMode = (typeof applyModes)[number]

const priceSyncSchema = z.object({
  price_sync_setting: z.object({
    enabled: z.boolean(),
    source_url: z.string(),
    interval_hours: z.coerce
      .number()
      .min(1, 'Interval must be at least 1 hour'),
    apply_mode: z.enum(applyModes),
    only_known_models: z.boolean(),
    exclude_models: z.string(),
    min_source_models: z.coerce.number().int().min(0),
  }),
})

type PriceSyncFormValues = z.output<typeof priceSyncSchema>
type PriceSyncFormInput = z.input<typeof priceSyncSchema>

type PriceSyncValues = {
  'price_sync_setting.enabled': boolean
  'price_sync_setting.source_url': string
  'price_sync_setting.interval_hours': number
  'price_sync_setting.apply_mode': ApplyMode
  'price_sync_setting.only_known_models': boolean
  'price_sync_setting.exclude_models': string
  'price_sync_setting.min_source_models': number
}

type PriceSyncSectionProps = {
  defaultValues: PriceSyncValues
}

function normalizeApplyMode(value?: string): ApplyMode {
  return applyModes.includes(value as ApplyMode)
    ? (value as ApplyMode)
    : 'decrease_only'
}

const buildFormDefaults = (defaults: PriceSyncValues): PriceSyncFormInput => ({
  price_sync_setting: {
    enabled: defaults['price_sync_setting.enabled'],
    source_url: defaults['price_sync_setting.source_url'] ?? '',
    interval_hours: defaults['price_sync_setting.interval_hours'] || 6,
    apply_mode: normalizeApplyMode(defaults['price_sync_setting.apply_mode']),
    only_known_models: defaults['price_sync_setting.only_known_models'],
    exclude_models: defaults['price_sync_setting.exclude_models'] ?? '',
    min_source_models: defaults['price_sync_setting.min_source_models'] ?? 50,
  },
})

const normalizeDefaults = (defaults: PriceSyncValues): PriceSyncValues => ({
  ...defaults,
  'price_sync_setting.source_url': (
    defaults['price_sync_setting.source_url'] ?? ''
  ).trim(),
  'price_sync_setting.exclude_models': (
    defaults['price_sync_setting.exclude_models'] ?? ''
  ).trim(),
  'price_sync_setting.apply_mode': normalizeApplyMode(
    defaults['price_sync_setting.apply_mode']
  ),
})

const normalizeFormValues = (values: PriceSyncFormValues): PriceSyncValues => ({
  'price_sync_setting.enabled': values.price_sync_setting.enabled,
  'price_sync_setting.source_url': values.price_sync_setting.source_url.trim(),
  'price_sync_setting.interval_hours': values.price_sync_setting.interval_hours,
  'price_sync_setting.apply_mode': values.price_sync_setting.apply_mode,
  'price_sync_setting.only_known_models':
    values.price_sync_setting.only_known_models,
  'price_sync_setting.exclude_models':
    values.price_sync_setting.exclude_models.trim(),
  'price_sync_setting.min_source_models':
    values.price_sync_setting.min_source_models,
})

export function PriceSyncSection({ defaultValues }: PriceSyncSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [isTriggering, setIsTriggering] = useState(false)
  const baselineRef = useRef<PriceSyncValues>(normalizeDefaults(defaultValues))

  const formDefaults = useMemo(
    () => buildFormDefaults(defaultValues),
    [defaultValues]
  )

  const form = useForm<PriceSyncFormInput, unknown, PriceSyncFormValues>({
    resolver: zodResolver(priceSyncSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  const applyMode = form.watch('price_sync_setting.apply_mode')

  const onSubmit = async (values: PriceSyncFormValues) => {
    const normalized = normalizeFormValues(values)
    const updates = (
      Object.keys(normalized) as Array<keyof PriceSyncValues>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      await updateOption.mutateAsync({ key, value: normalized[key] })
    }

    baselineRef.current = normalized
  }

  // The trigger runs against the SAVED configuration, so unsaved edits would
  // make the preview describe a different run than the form shows.
  const hasUnsavedChanges = form.formState.isDirty

  const runNow = async (dryRun: boolean) => {
    setIsTriggering(true)
    try {
      const res = await triggerModelPriceSync(dryRun)
      if (res.success) {
        toast.success(
          dryRun
            ? t('Dry run started. Check System Info for the result.')
            : t('Price sync started. Check System Info for the result.')
        )
      } else {
        toast.error(res.message || t('Failed to start price sync'))
      }
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status
      toast.error(
        status === 409
          ? t('A price sync task is already running.')
          : t('Failed to start price sync')
      )
    } finally {
      setIsTriggering(false)
    }
  }

  return (
    <SettingsSection title={t('Model Price Sync')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>
                {t('Automatic price sync')}
              </h4>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Pulls an upstream price table on a schedule and merges the derived ratios into the model pricing. Ratios are your selling price, so review a dry run before enabling.'
                )}
              </p>
            </div>

            <div className='grid min-w-0 gap-6 lg:grid-cols-3'>
              <FormField
                control={form.control}
                name='price_sync_setting.enabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Enable scheduled price sync')}</FormLabel>
                      <FormDescription>
                        {t('Runs on the master node only')}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='price_sync_setting.apply_mode'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Apply mode')}</FormLabel>
                    <Select
                      items={[
                        {
                          value: 'decrease_only',
                          label: t('Only apply price decreases'),
                        },
                        { value: 'all', label: t('Apply all differences') },
                        { value: 'dry_run', label: t('Dry run only') },
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value='decrease_only'>
                            {t('Only apply price decreases')}
                          </SelectItem>
                          <SelectItem value='all'>
                            {t('Apply all differences')}
                          </SelectItem>
                          <SelectItem value='dry_run'>
                            {t('Dry run only')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {applyMode === 'all'
                        ? t(
                            'Price increases will also be written automatically.'
                          )
                        : t(
                            'Price increases are reported in the task result and never written automatically.'
                          )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='price_sync_setting.interval_hours'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Sync interval (hours)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='1'
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className='grid min-w-0 gap-6 xl:grid-cols-2'>
              <FormField
                control={form.control}
                name='price_sync_setting.source_url'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Price table URL')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='https://.../model_prices_and_context_window.json'
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'A LiteLLM-format price table. Leave empty to use the built-in source.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='price_sync_setting.exclude_models'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Excluded models')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder='deepseek-*, gpt-4o'
                        value={field.value}
                        onChange={(event) => field.onChange(event.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Comma separated. A trailing * matches by prefix. Never synced.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className='grid min-w-0 gap-6 lg:grid-cols-2'>
              <FormField
                control={form.control}
                name='price_sync_setting.only_known_models'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Only update priced models')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Never introduce a model that this site does not already price'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              <FormField
                control={form.control}
                name='price_sync_setting.min_source_models'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Minimum models in source')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min='0'
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'A source carrying fewer models than this is treated as truncated and rejected.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className='flex flex-wrap items-center gap-3'>
              <Button
                type='button'
                variant='outline'
                disabled={isTriggering || hasUnsavedChanges}
                onClick={() => runNow(true)}
              >
                {t('Preview changes (dry run)')}
              </Button>

              {/* Applying rewrites every synced model's selling price site-wide,
                  so it asks first; the dry run does not. */}
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type='button'
                      variant='destructive'
                      disabled={isTriggering || hasUnsavedChanges}
                    />
                  }
                >
                  {t('Sync now')}
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('Apply upstream prices now?')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {applyMode === 'all'
                        ? t(
                            'This writes every difference from the upstream table, price increases included, to the live model pricing.'
                          )
                        : t(
                            'This writes the upstream price decreases to the live model pricing. Price increases are only reported.'
                          )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runNow(false)}>
                      {t('Sync now')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <p className='text-muted-foreground text-sm'>
                {hasUnsavedChanges
                  ? t('Save your changes before running a sync.')
                  : t('Results appear under System Info › System tasks.')}
              </p>
            </div>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
