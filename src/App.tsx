import React, { Component } from 'react';
import styles from './App.module.scss';
import * as firebase from 'firebase/app';
import 'firebase/database';



// tmp
type CardChoice = 'one' | 'two';

interface Member {
  last_seen_at: number;
  display_name: string;
  unique_key: string;
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


const config = {
  apiKey: 'AIzaSyA1PFaN-K0s8zgKP4rDL0E5_hvmKvXC5ME\n',
  databaseURL: 'https://buko106-planningpoker.firebaseio.com',
};
firebase.initializeApp(config);

interface State {
  currentRoom?: Room;
  roomAndKeyArray: Array<[Room, string]>;
}
class App extends Component<{}, State> {
  constructor(props: {}) {
    super(props);
    this.state = {
      roomAndKeyArray: [],
    };
    this.database = firebase.database();
    this.roomsRef = this.database.ref('/rooms');

    this.setupAsync();
  }

  private database: firebase.database.Database;
  private roomsRef: firebase.database.Reference;
  private currentRoomRef?: firebase.database.Reference;
  private serverTimeOffset = 0;

  async setupAsync(): Promise<void> {
    const THRESHOLD_OF_INACTIVITY_MSEC = 1000 * 300;
    this.serverTimeOffset = (await this.database.ref(".info/serverTimeOffset").once('value')).val();
    const getServerTime = () => (new Date().getTime() + this.serverTimeOffset);
    this.roomsRef.orderByChild('last_seen_at').startAt(getServerTime() - THRESHOLD_OF_INACTIVITY_MSEC).on('value', snapshot => {
      if (snapshot != null) {
        const rooms: Root['rooms'] = (snapshot.toJSON() || {}) as Root['rooms'];
        this.setState({
          roomAndKeyArray: Object.keys(rooms)
            .filter(k => rooms[k].last_seen_at >= getServerTime() - THRESHOLD_OF_INACTIVITY_MSEC)
            .map(k => [rooms[k], k] as [Room, string])
        });
      }
    });
  }

  private createRoom(name: string) {
    const member: Member = {
      display_name: 'disp',
      unique_key: 'key',
      last_seen_at: firebase.database.ServerValue.TIMESTAMP as number,
    };

    this.roomsRef.push({
      last_seen_at: firebase.database.ServerValue.TIMESTAMP as number,
      name,
      members: {
        hoge: member, fuga: member, piyo: member, aaa: member,
      },
    } as Room)
  }

  private enterRoom(key: string) {
    if (this.currentRoomRef && this.currentRoomRef.key === key) {
      return;
    }

    console.log(`entering to room  ${key}`);

    this.exitCurrentRoom();
    this.currentRoomRef = this.database.ref(`/rooms/${key}`);
    this.currentRoomRef.on('value', snapshot => {
      const room = snapshot!.toJSON() as Room;
      this.setState({currentRoom: room});
    });
  }

  private exitCurrentRoom() {
    console.log(`exiting current room`, this.currentRoomRef);
    if (this.currentRoomRef) {
      console.log(`key=${this.currentRoomRef.key}`);
      this.currentRoomRef.off('value');
      this.currentRoomRef = undefined;
    }
    this.setState({currentRoom: undefined});
  }

  private renderExitRoomSection() {
    return (
      <>
        {JSON.stringify(this.state.currentRoom)}
        <button onClick={() => this.exitCurrentRoom()}>leave room</button>
      </>
    )
  }

  render() {
    const {roomAndKeyArray, currentRoom} = this.state;
    return (
      <>
        <button onClick={() => this.createRoom('name of room')}>add room</button>
        {roomAndKeyArray.length > 0 ? roomAndKeyArray.map(([room, k]) => (
          <li key={k} onClick={() => this.enterRoom(k)}>{room.members ? Object.keys(room.members).length : 0}人 {room.name}</li>
        )) : <p>読み込み中…</p>}
        {currentRoom != null ? this.renderExitRoomSection() : null}
      </>
    );
  }
}

export default App;
