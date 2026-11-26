import * as React from 'react'
import { ArrowLeft, Edit, MessagesSquare, MoreVertical, Paperclip, Phone, Send, Video } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  Button,
  Input,
  Separator,
  cn,
  toast,
} from '@folio/base-ui-kit/client'
import rawConversations from '../data/convo.json'

interface ConvoMessage {
  sender: string
  message: string
  timestamp: string
}

interface Conversation {
  id: string
  profile: string
  username: string
  fullName: string
  title: string
  messages: ConvoMessage[]
}

const CONVERSATIONS = rawConversations.conversations as Conversation[]

const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')

const formatDay = (value: string): string =>
  new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })

const formatTime = (value: string): string =>
  new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function ChatsPage(): React.ReactElement {
  const [conversations, setConversations] = React.useState<Conversation[]>(() =>
    CONVERSATIONS.map(conversation => ({
      ...conversation,
      messages: [...conversation.messages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    })),
  )
  const [search, setSearch] = React.useState('')
  const [selectedId, setSelectedId] = React.useState<string | null>(conversations[0]?.id ?? null)
  const [draft, setDraft] = React.useState('')

  const selected = conversations.find(conversation => conversation.id === selectedId) ?? null
  const filtered = conversations.filter(conversation =>
    conversation.fullName.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const groups = React.useMemo(() => {
    if (!selected) return [] as { day: string; messages: ConvoMessage[] }[]
    const map = new Map<string, ConvoMessage[]>()
    for (const message of selected.messages) {
      const day = formatDay(message.timestamp)
      map.set(day, [...(map.get(day) ?? []), message])
    }
    return [...map.entries()].map(([day, messages]) => ({ day, messages }))
  }, [selected])

  const send = (): void => {
    const text = draft.trim()
    if (!text || !selectedId) return
    setConversations(previous =>
      previous.map(conversation =>
        conversation.id === selectedId
          ? {
              ...conversation,
              messages: [
                ...conversation.messages,
                { sender: 'You', message: text, timestamp: new Date().toISOString() },
              ],
            }
          : conversation,
      ),
    )
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 gap-6 px-4 py-6">
      <aside className="flex w-full shrink-0 flex-col gap-2 sm:w-56 lg:w-72 xl:w-80">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Inbox</h1>
            <MessagesSquare size={20} className="text-muted-foreground" />
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="rounded-lg"
            aria-label="New chat"
            onClick={() => toast({ title: 'New chat', description: 'Composer is a demo stub.' })}
          >
            <Edit size={20} className="text-muted-foreground" />
          </Button>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-md border border-border ps-2 focus-within:ring-1 focus-within:ring-ring">
          <span className="sr-only">Search chats</span>
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search chat..."
            className="h-8 border-0 bg-inherit px-0 shadow-none focus-visible:ring-0"
          />
        </label>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No conversations found.</p>
          ) : (
            filtered.map(conversation => {
              const last = conversation.messages[conversation.messages.length - 1]
              return (
                <React.Fragment key={conversation.id}>
                  <button
                    type="button"
                    className={cn(
                      'group flex w-full gap-2 rounded-md px-2 py-2 text-start text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                      selectedId === conversation.id && 'bg-muted',
                    )}
                    onClick={() => setSelectedId(conversation.id)}
                  >
                    <Avatar>
                      <AvatarFallback>{initials(conversation.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{conversation.fullName}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {last ? `${last.sender === 'You' ? 'You: ' : ''}${last.message}` : 'No messages yet'}
                      </span>
                    </span>
                  </button>
                  <Separator className="my-1" />
                </React.Fragment>
              )
            })
          )}
        </div>
      </aside>

      <section className="hidden min-h-0 min-w-0 flex-1 flex-col rounded-md border bg-background sm:flex">
        {selected ? (
          <>
            <div className="flex flex-none items-center justify-between border-b p-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarFallback>{initials(selected.fullName)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-sm font-medium lg:text-base">{selected.fullName}</div>
                  <div className="text-xs text-muted-foreground">{selected.title}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Call" onClick={() => toast({ title: 'Call', description: 'Not available in this demo.' })}>
                  <Phone size={16} />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Video call" onClick={() => toast({ title: 'Video call', description: 'Not available in this demo.' })}>
                  <Video size={16} />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Conversation settings">
                  <MoreVertical size={16} />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {groups.map(group => (
                  <div key={group.day} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Separator className="flex-1" />
                      <span className="text-[11px] text-muted-foreground">{group.day}</span>
                      <Separator className="flex-1" />
                    </div>
                    {group.messages.map((message, index) => {
                      const mine = message.sender === 'You'
                      return (
                        <div
                          key={`${group.day}-${index}`}
                          className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}
                        >
                          {mine ? null : (
                            <Avatar className="size-7">
                              <AvatarFallback>{initials(selected.fullName)}</AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={cn(
                              'max-w-[75%] rounded-lg px-3 py-2 text-sm shadow-xs',
                              mine
                                ? 'bg-primary text-primary-foreground'
                                : 'border bg-muted/60 text-foreground',
                            )}
                          >
                            <p className="whitespace-pre-wrap">{message.message}</p>
                            <span
                              className={cn(
                                'mt-1 block text-[10px]',
                                mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                              )}
                            >
                              {formatTime(message.timestamp)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <form
              className="flex flex-none items-center gap-2 border-t p-4"
              onSubmit={event => {
                event.preventDefault()
                send()
              }}
            >
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Attach a file">
                <Paperclip size={16} />
              </Button>
              <Input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder="Type a message..."
                className="h-9"
              />
              <Button type="submit" size="icon" aria-label="Send message" disabled={!draft.trim()}>
                <Send size={16} />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessagesSquare size={28} />
            Select a conversation to start chatting.
            <Button variant="outline" size="sm" onClick={() => setSelectedId(conversations[0]?.id ?? null)}>
              <ArrowLeft size={14} /> Back to inbox
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}
