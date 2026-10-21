<script setup lang="ts">
import { Button, Container, Grid, Heading, Link, Section, Stack, Text, formatPhone } from '@app/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import siteConfig from '../../site.config'
import mapPlaceholder from '../assets/generated/map.webp?url'

const { t } = useI18n()
const { contacts } = siteConfig
const phoneText = formatPhone(contacts.phoneE164.replace(/\D/g, ''))
const mapLoaded = ref(false)

/** Интерактивная карта грузится только после клика: сторонний скрипт и cookie — по действию пользователя. */
const mapSrc = computed(() => {
  const { lat, lon, zoom } = contacts.map
  return `https://yandex.ru/map-widget/v1/?ll=${lon}%2C${lat}&z=${zoom}&pt=${lon}%2C${lat}%2Cpm2rdm`
})
</script>

<template>
  <Section id="contacts" tone="muted" labelledby="contacts-title">
    <Container size="xl">
      <Stack :gap="8">
        <Heading id="contacts-title" k="site.contacts.title" :level="2" />
        <Grid :cols="{ base: 1, md: 2 }" :gap="8">
          <dl class="contacts__list">
            <div>
              <Text k="site.contacts.address" as="dt" variant="label" tone="muted" />
              <Text :k="contacts.address" as="dd" class="contacts__value" />
            </div>
            <div>
              <Text k="site.contacts.hours" as="dt" variant="label" tone="muted" />
              <Text :k="contacts.workingHours" as="dd" class="contacts__value" />
            </div>
            <div>
              <Text k="site.contacts.phone" as="dt" variant="label" tone="muted" />
              <dd class="contacts__value">
                <Link :href="`tel:${contacts.phoneE164}`" :text="phoneText" />
              </dd>
            </div>
            <div>
              <Text k="site.contacts.email" as="dt" variant="label" tone="muted" />
              <dd class="contacts__value">
                <Link :href="`mailto:${contacts.email}`" :text="contacts.email" />
              </dd>
            </div>
          </dl>
          <div class="contacts__map">
            <iframe
              v-if="mapLoaded"
              :src="mapSrc"
              :title="t('site.contacts.mapTitle')"
              class="contacts__frame"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <template v-else>
              <img
                :src="mapPlaceholder"
                :alt="t('site.contacts.mapAlt')"
                width="800"
                height="450"
                loading="lazy"
                decoding="async"
              />
              <div class="contacts__map-action">
                <Button
                  label="site.contacts.showMap"
                  icon-start="map-pin"
                  @click="mapLoaded = true"
                />
                <Text k="site.contacts.mapHint" variant="caption" as="p" class="contacts__hint" />
              </div>
            </template>
          </div>
        </Grid>
      </Stack>
    </Container>
  </Section>
</template>

<style scoped>
.contacts__list {
  display: grid;
  gap: var(--space-5);
  margin: 0;
}

.contacts__value {
  margin: var(--space-1) 0 0;
}

.contacts__map {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  aspect-ratio: 16 / 9;
}

.contacts__map img,
.contacts__frame {
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: cover;
}

.contacts__map-action {
  position: absolute;
  inset: auto var(--space-4) var(--space-4) var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface);
}

.contacts__hint {
  color: var(--color-text-muted);
}
</style>
