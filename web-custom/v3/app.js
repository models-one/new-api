const mobilePreview = window.location.pathname.startsWith('/v3/mobile')
const routeRoot = mobilePreview ? '/v3/mobile' : '/v3'

const destinations = [
  { labels: ['models.one', 'home'], path: `${routeRoot}/` },
  { labels: ['dashboard', '仪表盘'], path: `${routeRoot}/dashboard/` },
  { labels: ['models', 'model library', '模型', '模型库'], path: `${routeRoot}/models/` },
  {
    labels: ['settings', 'integrations', 'api keys', '设置', '集成'],
    path: `${routeRoot}/settings/`,
  },
]

if (!mobilePreview) {
  destinations.push(
    { labels: ['usage', 'usage & billing', '账单与用量'], path: '/v3/usage/' },
    { labels: ['analytics', 'advanced analytics', '深度统计分析'], path: '/v3/analytics/' },
    { labels: ['billing', 'wallet', '钱包充值'], path: '/v3/wallet/' },
    { labels: ['api logs', 'logs', 'api 调用日志'], path: '/v3/logs/' },
    {
      labels: ['organization', 'team', 'team & organization', '组织管理'],
      path: '/v3/organization/',
    },
  )
}

const normalizedLabel = (element) =>
  element.textContent.replace(/\s+/g, ' ').trim().toLowerCase()

const destinationFor = (element) => {
  const label = normalizedLabel(element)
  return destinations.find((destination) =>
    destination.labels.some(
      (candidate) => label === candidate || label.endsWith(` ${candidate}`),
    ),
  )
}

document.querySelectorAll('a[href="#"]').forEach((link) => {
  const destination = destinationFor(link)
  if (destination) {
    link.href = destination.path
    return
  }

  link.addEventListener('click', (event) => event.preventDefault())
})

const commandDestinations = [
  { labels: ['sign in', 'get started', 'start building free'], path: `${routeRoot}/dashboard/` },
  { labels: ['explore models'], path: `${routeRoot}/models/` },
]

if (!mobilePreview) {
  commandDestinations.push(
    {
      labels: ['top up balance', 'upgrade plan', 'upgrade to pro', 'manage payment'],
      path: '/v3/wallet/',
    },
    { labels: ['view billing history', 'order history'], path: '/v3/usage/' },
    { labels: ['view api logs', 'api logs'], path: '/v3/logs/' },
    { labels: ['account_circle', 'invite member'], path: '/v3/organization/' },
  )
}

document.querySelectorAll('button').forEach((button) => {
  const label = normalizedLabel(button)
  const destination = commandDestinations.find((candidate) =>
    candidate.labels.some(
      (candidateLabel) => label === candidateLabel || label.endsWith(` ${candidateLabel}`),
    ),
  )
  if (!destination) return

  button.addEventListener('click', () => window.location.assign(destination.path))
})
