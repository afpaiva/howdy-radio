export interface SlackMessage {
  type: string;
  user: string;
  text: string;
  ts: string;
  subtype?: string;
}

export interface SlackHistoryResponse {
  ok: boolean;
  messages?: SlackMessage[];
  has_more?: boolean;
  response_metadata?: {
    next_cursor?: string;
  };
}

export interface SlackUserInfoResponse {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    real_name?: string;
    profile?: {
      display_name: string;
      display_name_normalized?: string;
      real_name?: string;
    };
  };
}
