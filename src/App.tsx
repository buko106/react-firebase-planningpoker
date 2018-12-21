import React, { Component } from 'react';
import * as firebase from 'firebase/app';
import 'firebase/database';
import { interval, Subscription } from 'rxjs';
import * as uuid from 'uuid';
import { BackButton, Input, List, ListHeader, ListItem, Navigator, Page, Toolbar } from 'react-onsenui';

type CardChoice = 'one' | 'two';
const CARD_CHOICES: CardChoice[] = ['one', 'two'];

interface Member {
  last_seen_at: number;
  display_name: string;
  card_choice?: CardChoice;
}

interface Room {
  last_seen_at: number;
  name: string;
  members?: {[key in string]: Member};
}

interface Root {
  rooms: {[key in string]: Room};
}

interface RoomStats {
  name: string,
  key: string,
  activeMemberCount: number,
}

const config = {
  apiKey: 'AIzaSyA1PFaN-K0s8zgKP4rDL0E5_hvmKvXC5ME\n',
  databaseURL: 'https://buko106-planningpoker.firebaseio.com',
};
firebase.initializeApp(config);

interface State {
  currentRoom?: Room;
  roomStatsArray: Array<RoomStats>;
  myName: string;
  newRoomName: string;
}
class App extends Component<{}, State> {
  constructor(props: {}) {
    super(props);
    this.state = {
      roomStatsArray: [],
      myName: '',
      newRoomName: '',
    };
    this.database = firebase.database();
    this.roomsRef = this.database.ref('/rooms');
    this.myMemberKey = localStorage.getItem('myMemberKey') || uuid.v4();
    localStorage.setItem('myMemberKey', this.myMemberKey);

    this.setupAsync();
  }

  private myMemberKey: string;
  private database: firebase.database.Database;
  private roomsRef: firebase.database.Reference;
  private currentRoomRef?: firebase.database.Reference;
  private currentRoomLastSeenAtRef?: firebase.database.Reference;
  private currentRoomMembersRef?: firebase.database.Reference;
  private currentMyPresenceRef?: firebase.database.Reference;

  private serverTimeOffset = 0;
  private updateLastSeenAtTimerSubscription?: Subscription;

  private getServerTime() {
    return new Date().getTime() + this.serverTimeOffset;
  }

  async setupAsync(): Promise<void> {
    const THRESHOLD_OF_INACTIVITY_MSEC = 1000 * 60; // one minute
    this.serverTimeOffset = (await this.database.ref(".info/serverTimeOffset").once('value')).val();
    this.roomsRef.orderByChild('last_seen_at').startAt(this.getServerTime() - THRESHOLD_OF_INACTIVITY_MSEC).on('value', snapshot => {
      if (snapshot != null) {
        const rooms: Root['rooms'] = (snapshot.toJSON() || {}) as Root['rooms'];
        const serverTimeWithThresholdOffset = this.getServerTime() - THRESHOLD_OF_INACTIVITY_MSEC;
        this.setState({
          roomStatsArray: Object.keys(rooms)
            .filter(k => rooms[k].last_seen_at >= serverTimeWithThresholdOffset)
            .map(k => ({
              name: rooms[k].name,
              activeMemberCount: Object.keys(rooms[k].members || {})
                .map(memberKey => (rooms[k].members![memberKey].last_seen_at >= serverTimeWithThresholdOffset))
                .length,
              key: k,
            } as RoomStats))
        });
      }
    });
  }

  private async createRoom(name: string) {
    await this.roomsRef.push({
      last_seen_at: firebase.database.ServerValue.TIMESTAMP,
      name,
    } as Room);
  }

  private async enterRoom(key: string) {
    if (this.currentRoomRef && this.currentRoomRef.key === key) {
      return;
    }

    console.log(`entering to room  ${key}`);

    await this.leaveCurrentRoom();
    this.currentRoomRef = this.database.ref(`/rooms/${key}`);
    this.currentRoomLastSeenAtRef = this.currentRoomRef.child('last_seen_at');
    this.currentRoomMembersRef = this.currentRoomRef.child('members');
    this.currentMyPresenceRef = this.currentRoomMembersRef.child(this.myMemberKey);
    await this.currentMyPresenceRef.set({
      last_seen_at: firebase.database.ServerValue.TIMESTAMP,
      display_name: this.state.myName,
    } as Member);
    this.currentRoomRef.on('value', snapshot => {
      const room = snapshot!.toJSON() as Room;
      this.setState({currentRoom: room});
    });
    this.updateLastSeenAtTimerSubscription = interval(5000).subscribe(async () => {
      await Promise.all([
        this.currentRoomLastSeenAtRef!.set(firebase.database.ServerValue.TIMESTAMP),
        this.currentMyPresenceRef!.child('last_seen_at').set(firebase.database.ServerValue.TIMESTAMP),
      ]);
    });

    console.log(`entered to room  ${key}`, this.currentRoomRef);
  }

  private async leaveCurrentRoom() {
    console.log(`exiting current room`, this.currentRoomRef);
    if (this.currentRoomRef) {
      console.log(`key=${this.currentRoomRef.key}`);
      this.currentRoomRef.off('value');
      this.currentRoomRef = undefined;

      if (this.updateLastSeenAtTimerSubscription) {
        this.updateLastSeenAtTimerSubscription.unsubscribe();
      }
      await this.currentMyPresenceRef!.remove();

      this.currentRoomLastSeenAtRef = undefined;
      this.currentRoomMembersRef = undefined;
      this.currentMyPresenceRef = undefined;
    }
    this.setState({currentRoom: undefined});

    console.log(`exited current room`, this.currentRoomRef);
  }

  private async chooseChard(choice?: CardChoice) {
    if (choice == null) {
      await this.currentMyPresenceRef!.child('card_choice').remove();
    } else {
      await this.currentMyPresenceRef!.child('card_choice').set(choice);
    }
  }

  private renderCurrentRoomSection() {
    const {currentRoom} = this.state;
    if (currentRoom == null) {
      return null;
    }

    return (
      <>
        <p>{currentRoom.name}</p>
        {Object.keys(currentRoom.members || {}).map(k => (
          <div key={k}>
            <span>name: {currentRoom.members![k].display_name}</span>
            <span>     card: {currentRoom.members![k].card_choice}</span>
          </div>
        ))}
        <div>
          <button onClick={() => this.chooseChard(undefined)}>reset</button>
          {CARD_CHOICES.map(choice => (<button key={choice} onClick={() => this.chooseChard(choice)}>{choice}</button>))}
        </div>
        <button onClick={() => this.leaveCurrentRoom()}>leave room</button>
      </>
    )
  }

  renderPage(route: any, navigator?: Navigator) {
    console.log({route, navigator});

    if (route.pageName === 'rooms') {
      return (
        <Page
          renderToolbar={() => (
            <Toolbar>
              <div className="center">Rooms</div>
            </Toolbar>
          )}>
          <List>
            <ListHeader>Add Room</ListHeader>
            <ListItem><Input placeholder={'new room name'} value={this.state.newRoomName} onChange={e => this.setState({newRoomName: e.target.value})} /></ListItem>
            <ListItem onClick={() => this.createRoom(this.state.newRoomName)}>+</ListItem>
          </List>
          <List dataSource={this.state.roomStatsArray}
                renderHeader={() => (<ListHeader>Rooms</ListHeader>)}
                renderRow={(roomStats: RoomStats) => (
                  <ListItem onClick={async () => { await this.enterRoom(roomStats.key); navigator!.pushPage({pageName: 'room-detail', roomKey: roomStats.key}); }}>
                    {roomStats.activeMemberCount} members / {roomStats.name}
                  </ListItem>
                )}
          />
        </Page>
      )
    } else if (route.pageName === 'room-detail') {
      return (
        <Page
          renderToolbar={() => (
            <Toolbar>
              <BackButton onClick={() => this.leaveCurrentRoom()}/>
              <div className="center">Room {this.state.currentRoom!.name}</div>
            </Toolbar>
          )}
        >
          <List>
            <ListHeader>Members</ListHeader>
          </List>
        </Page>
      )
    }
    return <div>ぺーじがないよ</div>
  }

  render() {
    const {roomStatsArray, currentRoom, myName, newRoomName} = this.state;
    if (currentRoom) {
      return this.renderCurrentRoomSection();
    }

    return (
      <>
        <div>
          <span>my name:</span>
          <input type="text" value={myName} onChange={(e) => this.setState({myName: e.target.value})} />
        </div>
        <div>
          <input type="text" value={newRoomName} onChange={(e) => this.setState({newRoomName: e.target.value})} />
          <button onClick={() => this.createRoom(newRoomName || 'default room name')}>add room</button>
        </div>
        {roomStatsArray.length > 0 ? roomStatsArray.map(({activeMemberCount, name, key}) => (
          <li key={key}>
            <button onClick={() => this.enterRoom(key)}>enter</button>
            <span> {activeMemberCount}人 : {name}</span>
          </li>
        )) : <p>読み込み中…</p>}
        <Navigator renderPage={(route, navigator) => this.renderPage(route, navigator)} initialRoute={{pageName: 'rooms'}} />
      </>
    );
  }
}

export default App;
