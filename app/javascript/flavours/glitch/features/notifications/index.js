import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import ImmutablePropTypes from 'react-immutable-proptypes';
import Column from 'flavours/glitch/components/column';
import ColumnHeader from 'flavours/glitch/components/column_header';
import {
  enterNotificationClearingMode,
  expandNotifications,
  scrollTopNotifications,
  mountNotifications,
  unmountNotifications,
  loadPending,
} from 'flavours/glitch/actions/notifications';
import { addColumn, removeColumn, moveColumn } from 'flavours/glitch/actions/columns';
import NotificationContainer from './containers/notification_container';
import { defineMessages, injectIntl, FormattedMessage } from 'react-intl';
import ColumnSettingsContainer from './containers/column_settings_container';
import FilterBarContainer from './containers/filter_bar_container';
import { createSelector } from 'reselect';
import { List as ImmutableList } from 'immutable';
import { debounce } from 'lodash';
import ScrollableList from 'flavours/glitch/components/scrollable_list';
import LoadGap from 'flavours/glitch/components/load_gap';

const messages = defineMessages({
  title: { id: 'column.notifications', defaultMessage: 'Notifications' },
});

const getNotifications = createSelector([
  state => state.getIn(['settings', 'notifications', 'quickFilter', 'show']),
  state => state.getIn(['settings', 'notifications', 'quickFilter', 'active']),
  state => ImmutableList(state.getIn(['settings', 'notifications', 'shows']).filter(item => !item).keys()),
  state => state.getIn(['notifications', 'items']),
], (showFilterBar, allowedType, excludedTypes, notifications) => {
  if (!showFilterBar || allowedType === 'all') {
    // used if user changed the notification settings after loading the notifications from the server
    // otherwise a list of notifications will come pre-filtered from the backend
    // we need to turn it off for FilterBar in order not to block ourselves from seeing a specific category
    return notifications.filterNot(item => item !== null && excludedTypes.includes(item.get('type')));
  }
  return notifications.filter(item => item !== null && allowedType === item.get('type'));
});

const mapStateToProps = state => ({
  showFilterBar: state.getIn(['settings', 'notifications', 'quickFilter', 'show']),
  notifications: getNotifications(state),
  localSettings:  state.get('local_settings'),
  isLoading: state.getIn(['notifications', 'isLoading'], true),
  isUnread: state.getIn(['notifications', 'unread']) > 0 || state.getIn(['notifications', 'pendingItems']).size > 0,
  hasMore: state.getIn(['notifications', 'hasMore']),
  numPending: state.getIn(['notifications', 'pendingItems'], ImmutableList()).size,
  notifCleaningActive: state.getIn(['notifications', 'cleaningMode']),
});

/* glitch */
const mapDispatchToProps = dispatch => ({
  onEnterCleaningMode(yes) {
    dispatch(enterNotificationClearingMode(yes));
  },
  onMount() {
    dispatch(mountNotifications());
  },
  onUnmount() {
    dispatch(unmountNotifications());
  },
  dispatch,
});

export default @connect(mapStateToProps, mapDispatchToProps)
@injectIntl
class Notifications extends React.PureComponent {

  static propTypes = {
    columnId: PropTypes.string,
    notifications: ImmutablePropTypes.list.isRequired,
    showFilterBar: PropTypes.bool.isRequired,
    dispatch: PropTypes.func.isRequired,
    shouldUpdateScroll: PropTypes.func,
    intl: PropTypes.object.isRequired,
    isLoading: PropTypes.bool,
    isUnread: PropTypes.bool,
    multiColumn: PropTypes.bool,
    hasMore: PropTypes.bool,
    numPending: PropTypes.number,
    localSettings: ImmutablePropTypes.map,
    notifCleaningActive: PropTypes.bool,
    onEnterCleaningMode: PropTypes.func,
    onMount: PropTypes.func,
    onUnmount: PropTypes.func,
  };

  static defaultProps = {
    trackScroll: true,
  };

  handleLoadGap = (maxId) => {
    this.props.dispatch(expandNotifications({ maxId }));
  };

  handleLoadOlder = debounce(() => {
    const last = this.props.notifications.last();
    this.props.dispatch(expandNotifications({ maxId: last && last.get('id') }));
  }, 300, { leading: true });

  handleLoadPending = () => {
    this.props.dispatch(loadPending());
  };

  handleScrollToTop = debounce(() => {
    this.props.dispatch(scrollTopNotifications(true));
  }, 100);

  handleScroll = debounce(() => {
    this.props.dispatch(scrollTopNotifications(false));
  }, 100);

  handlePin = () => {
    const { columnId, dispatch } = this.props;

    if (columnId) {
      dispatch(removeColumn(columnId));
    } else {
      dispatch(addColumn('NOTIFICATIONS', {}));
    }
  }

  handleMove = (dir) => {
    const { columnId, dispatch } = this.props;
    dispatch(moveColumn(columnId, dir));
  }

  handleHeaderClick = () => {
    this.column.scrollTop();
  }

  setColumnRef = c => {
    this.column = c;
  }

  handleMoveUp = id => {
    const elementIndex = this.props.notifications.findIndex(item => item !== null && item.get('id') === id) - 1;
    this._selectChild(elementIndex, true);
  }

  handleMoveDown = id => {
    const elementIndex = this.props.notifications.findIndex(item => item !== null && item.get('id') === id) + 1;
    this._selectChild(elementIndex, false);
  }

  _selectChild (index, align_top) {
    const container = this.column.node;
    const element = container.querySelector(`article:nth-of-type(${index + 1}) .focusable`);

    if (element) {
      if (align_top && container.scrollTop > element.offsetTop) {
        element.scrollIntoView(true);
      } else if (!align_top && container.scrollTop + container.clientHeight < element.offsetTop + element.offsetHeight) {
        element.scrollIntoView(false);
      }
      element.focus();
    }
  }

  componentDidMount () {
    const { onMount } = this.props;
    if (onMount) {
      onMount();
    }
  }

  componentWillUnmount () {
    const { onUnmount } = this.props;
    if (onUnmount) {
      onUnmount();
    }
  }

  render () {
    const { intl, notifications, shouldUpdateScroll, isLoading, isUnread, columnId, multiColumn, hasMore, numPending, showFilterBar } = this.props;
    const pinned = !!columnId;
    const emptyMessage = <FormattedMessage id='empty_column.notifications' defaultMessage="You don't have any notifications yet. Interact with others to start the conversation." />;

    let scrollableContent = null;

    const filterBarContainer = showFilterBar
      ? (<FilterBarContainer />)
      : null;

    if (isLoading && this.scrollableContent) {
      scrollableContent = this.scrollableContent;
    } else if (notifications.size > 0 || hasMore) {
      scrollableContent = notifications.map((item, index) => item === null ? (
        <LoadGap
          key={'gap:' + notifications.getIn([index + 1, 'id'])}
          disabled={isLoading}
          maxId={index > 0 ? notifications.getIn([index - 1, 'id']) : null}
          onClick={this.handleLoadGap}
        />
      ) : (
        <NotificationContainer
          key={item.get('id')}
          notification={item}
          accountId={item.get('account')}
          onMoveUp={this.handleMoveUp}
          onMoveDown={this.handleMoveDown}
        />
      ));
    } else {
      scrollableContent = null;
    }

    this.scrollableContent = scrollableContent;

    const scrollContainer = (
      <ScrollableList
        scrollKey={`notifications-${columnId}`}
        trackScroll={!pinned}
        isLoading={isLoading}
        showLoading={isLoading && notifications.size === 0}
        hasMore={hasMore}
        numPending={numPending}
        emptyMessage={emptyMessage}
        onLoadMore={this.handleLoadOlder}
        onLoadPending={this.handleLoadPending}
        onScrollToTop={this.handleScrollToTop}
        onScroll={this.handleScroll}
        shouldUpdateScroll={shouldUpdateScroll}
      >
        {scrollableContent}
      </ScrollableList>
    );

    return (
      <Column
        ref={this.setColumnRef}
        name='notifications'
        extraClasses={this.props.notifCleaningActive ? 'notif-cleaning' : null}
        label={intl.formatMessage(messages.title)}
      >
        <ColumnHeader
          icon='bell'
          active={isUnread}
          title={intl.formatMessage(messages.title)}
          onPin={this.handlePin}
          onMove={this.handleMove}
          onClick={this.handleHeaderClick}
          pinned={pinned}
          multiColumn={multiColumn}
          localSettings={this.props.localSettings}
          notifCleaning
          notifCleaningActive={this.props.notifCleaningActive} // this is used to toggle the header text
          onEnterCleaningMode={this.props.onEnterCleaningMode}
        >
          <ColumnSettingsContainer />
        </ColumnHeader>
        {filterBarContainer}
        {scrollContainer}
      </Column>
    );
  }

}
