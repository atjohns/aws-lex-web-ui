<template>
  <div
    v-if="message.text && (message.type === 'human' || message.type === 'feedback')"
    class="message-text"
  >
    <span class="sr-only">I say: </span>{{ message.text }}
  </div>
  <div
    v-else-if="altHtmlMessage && AllowSuperDangerousHTMLInMessage"
    v-html="altHtmlMessage"
    class="message-text"
  ></div>
  <div
    v-else-if="message.text && shouldRenderAsHtml"
    v-html="botMessageAsHtml"
    class="message-text"
  ></div>
  <div
    v-else-if="message.text && (message.type === 'bot' || message.type === 'agent')"
    class="message-text bot-message-plain"
  >
    <span class="sr-only">{{ message.type }} says: </span>{{ (shouldStripTags) ? stripTagsFromMessage(message.text) : message.text }}
  </div>
</template>

<script>
/*
Copyright 2017-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.

Licensed under the Amazon Software License (the "License"). You may not use this file
except in compliance with the License. A copy of the License is located at

http://aws.amazon.com/asl/

or in the "license" file accompanying this file. This file is distributed on an "AS IS"
BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, express or implied. See the
License for the specific language governing permissions and limitations under the License.
*/
import {chatMode} from '@/store/state';
import { marked } from 'marked';
import { escapeHtml, sanitizeHtml, stripHtmlTags } from '@/lib/sanitize';

// Custom tokenizer for HTTPS and tel links
const linkTokenizer = {
  name: 'customLink',
  level: 'inline',
  start(src) {
    return src.match(/https?:\/\/|tel:/)?.index;
  },
  tokenizer(src) {
    const httpsMatch = src.match(/^(https?:\/\/[^\s<>"{}|\\^`[\]]+)/);
    if (httpsMatch) {
      return {
        type: 'customLink',
        raw: httpsMatch[0],
        href: httpsMatch[1],
        text: httpsMatch[1],
        linkType: 'https'
      };
    }

    const telMatch = src.match(/^(tel:[\d\-\+\(\)\s]+)/);
    if (telMatch) {
      return {
        type: 'customLink',
        raw: telMatch[0],
        href: telMatch[1],
        text: telMatch[1].replace('tel:', ''),
        linkType: 'tel'
      };
    }
  },
  renderer(token) {
    return `<a href="${token.href}" ${token.linkType === 'tel' ? 'class="tel-link" target="_blank"' : 'target="_blank"'}>${token.text}</a>`;
  }
};

marked.use({ extensions: [linkTokenizer] });

export default {
  name: 'message-text',
  props: ['message'],
  computed: {
    shouldConvertUrlToLinks() {
      return this.$store.state.config.ui.convertUrlToLinksInBotMessages;
    },
    shouldStripTags() {
      return this.$store.state.config.ui.stripTagsFromBotMessages;
    },
    AllowSuperDangerousHTMLInMessage() {
      return this.$store.state.config.ui.AllowSuperDangerousHTMLInMessage;
    },
    altHtmlMessage() {
      let out = false;
      if (this.message.alts) {
        if (this.message.alts.html) {
          out = sanitizeHtml(this.message.alts.html);
        } else if (this.message.alts.markdown) {
          out = sanitizeHtml(marked.parse(this.message.alts.markdown));
        }
      }
      if (out) out = this.prependBotScreenReader(out);
      return out;
    },
    shouldRenderAsHtml() {
      return (['bot', 'agent'].includes(this.message.type) && this.shouldConvertUrlToLinks);
    },
    botMessageAsHtml() {
      // Security Note: Make sure that the content is escaped according
      // to context (e.g. URL, HTML). This is rendered as HTML
      const messageText = this.stripTagsFromMessage(this.message.text);
      const messageWithLinks = this.botMessageWithLinks(messageText);
      return this.prependBotScreenReader(messageWithLinks);
    },
  },
  methods: {
    encodeAsHtml(value) {
      return escapeHtml(value);
    },
    botMessageWithLinks(messageText) {
      const linkReplacers = [
        // The regex in the objects of linkReplacers should return a single
        // reference (from parenthesis) with the whole address
        // The replace function takes a matched url and returns the
        // hyperlink that will be replaced in the message
        {
          type: 'web',
          regex: new RegExp(
            '\\b((?:https?://\\w{1}|www\\.)(?:[\\w-.]){2,256}' +
            '(?:[\\w._~:/?#@!$&()*+,;=[\'\\]-]){0,256})',
            'im',
          ),
          replace: (item) => {
            const url = (!/^https?:\/\//.test(item)) ? `http://${item}` : item;
            return '<a target="_blank" ' +
              `href="${encodeURI(url)}">${item}</a>`;
          },
        },
        {
          type: 'tel',
          regex: new RegExp(
            '\\b(tel:[+]?[\\d\\-\\(\\)\\.]{7,20})',
            'im',
          ),
          replace: (item) => {
            const displayText = item.replace(/^tel:/, '');
            return `<a href="${encodeURI(item)}" target="_blank">${displayText}</a>`;
          },
        },
      ];

      let origMessageEncoded = this.encodeAsHtml(messageText)
      return linkReplacers
        .reduce(
          (message, replacer) =>
            // splits the message into an array containing content chunks
            // and links. Content chunks will be the even indexed items in the
            // array (or empty string when applicable).
            // Links (if any) will be the odd members of the array since the
            // regex keeps references.
            message.split(replacer.regex)
              .reduce(
                (messageAccum, item, index, array) => {
                  let messageResult = '';
                  if ((index % 2) === 0) {
                    const urlItem = ((index + 1) === array.length) ?
                      '' : replacer.replace(array[index + 1]);
                    messageResult = `${item}${urlItem}`;
                  }
                  return messageAccum + messageResult;
                },
                '',
              ),
          origMessageEncoded,
        );
    },
    // used for stripping SSML (and other) tags from bot responses
    stripTagsFromMessage(messageText) {
      return stripHtmlTags(messageText);
    },
    isLiveChat() {
      return (this.$store.state.config.ui.enableLiveChat &&
        this.$store.state.chatMode === chatMode.LIVECHAT);
    },
    prependBotScreenReader(messageText) {
      if (this.isLiveChat()) {
        return `<span class="sr-only">agent says: </span>${messageText}`;
      } else {
        return `<span class="sr-only">bot says: </span>${messageText}`;
      }
    },
  },
};
</script>

<style scoped>
.message-text {
  hyphens: auto;
  overflow-wrap: break-word;
  padding: 0.8em;
  white-space: normal;
  word-break: break-word;
  width: 100%;
}

.message-text :deep(p) {
  margin-bottom: 16px;
}
</style>

<style>
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(1px, 1px, 1px, 1px) !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
  border: 0 !important;
}
</style>
