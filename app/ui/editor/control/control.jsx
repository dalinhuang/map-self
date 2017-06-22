import './control.css';
import React from 'react';
import { connect } from 'react-redux';  
import { Button, message, Menu, Dropdown, Icon, Modal } from 'antd'; 
import SaveConfirm from '../utils/saveConfirm.jsx';
import { getSelect, setSelect } from '../utils/select';

import * as Service from '../../../services/index';
import { SET_STATUS, SET_STORE, SET_BKSTORE, INCREASE_MAXNUM } from '../../../action/actionTypes';

class Control extends React.Component{
  constructor(props) {
    super(props);

    this.drawPloy = this.drawPloy.bind(this);
    this.setMerge = this.setMerge.bind(this);
    this.deleteStore = this.deleteStore.bind(this);
    this.mergeStore = this.mergeStore.bind(this);
    this.editStart = this.editStart.bind(this);
    this.saveEdit = this.saveEdit.bind(this);
    this.dropDown = this.dropDown.bind(this);
    this.editRegion = this.editRegion.bind(this);
    this.submitAll = this.submitAll.bind(this);

    this.checkAct = this.checkAct.bind(this);
    this.cancelAct = this.cancelAct.bind(this);

    this.fixStoreParam = this.fixStoreParam.bind(this);
  }

	fixStoreParam(obj) {
		let coords = [];
		let centerPoint = null;
		let centerPointXY = {x : 0, y : 0};
		let coordsList = [];
		let layerType = '';
		let paramId = '';

		if(obj.graphics) {
			layerType = 'graphics';
		}

		if(obj.action != 'DELETE') {
			if(obj.coords) {
				coords = obj.coords;
				centerPoint = obj.getBounds().getCenter();
			} 
			else {
				if(obj.getCenter) {
					centerPoint = obj.getCenter();
				}
				else {
					centerPoint = obj[layerType].getCenter();
				}
				
				coordsList = FMap.Utils.getOriginalByLatlngs(obj.getLatLngs());
				if(coordsList[0].length > 1) {
					coords = coordsList[0];
				}
				else {
					coords = coordsList[0][0];
				}
			}
			
			centerPointXY = FMap.Utils.toOriginalCoordinates(centerPoint);
		}

		if(obj.action == 'NEW') {
      const floor = this.props.map;

      this.props.dispatch({
        type : INCREASE_MAXNUM
      });
			// this.state.floorMaxNum ++ ;
			paramId = floor.plazaId + '_' + floor.floorName + '_' + floor.floorMaxNum;
		}
		else {
			paramId = obj.feature.properties.region_id;
		}

		const param = {
			type : 'Feature',
			id : paramId,
			properties : {
				centerx : centerPointXY.x,
				centery : centerPointXY.y,
				re_name : obj.feature.properties.re_name || '',
				re_type : obj.feature.properties.re_type || '',
				region_id : paramId
			},
			geometry : {
				type : 'MultiPolygon',
				coordinates : [[coords.concat(coords.slice(0,1))]]
			}
		};

		return {
			action : obj.action,
			feature : param
		}
	}

  //保存
  saveEdit() {
    const storeList = this.props.store.store;
    const control = this.props.control;
    const map = this.props.map;

    if(storeList.length == 0) {
      message.warning('没有正在编辑的商铺！', 3);
			return;
    }
    if( control.isSubMerge && storeList.length < 3 ) {
			message.warning('商铺合并操作未完成，请继续操作！', 3);
			return;
		}

    const regionParam = storeList.map(item => {
			return this.fixStoreParam(item);
		});

    Service.saveDataAjax(
      preAjaxUrl + '/mapeditor/map/plaza/edit/region/' + map.plazaId + '/' + map.floorId,
      regionParam,
      () => {
        Modal.success({
          title : '提示',
          content : '保存成功！'
        });
      },
      () => {
        if(storeList[0].transform) {
          storeList[0].transform.enable({
            rotation: false,
            scaling : false
          });
        }

        if(storeList[0].dragging) {
          storeList[0].dragging.disable();
        }

        if(storeList[0].eachLayer) {
          storeList[0].eachLayer( i => {
            i.disableEdit();
          });
        }
        else {
          storeList[0].disableEdit();
        }

        this.props.dispatch({
          type : SET_STATUS,
          status : {
            isAdd : true,
            isEdit : true,
            isDelete : true,
            isMerge : true,
            isSubMerge : false,
            isZT : true,
            isStart : false,
            isActive : false
          }
        });

        this.props.dispatch({
          type : SET_STORE,
          data : []
        })
        this.props.dispatch({
          type : SET_BKSTORE,
          data : []
        })
      }
    );
  }

  //合并
  setMerge() {
    if(!this.checkAct()) {return}
    this.props.dispatch({
      type : SET_STATUS,
      status : {
        isAdd : false,
        isEdit : false,
        isDelete : false,
        isMerge : true,
        isSubMerge : false,
        isZT : false,
        isStart : false,
        isActive : true
      }
    });
  }

  mergeStore(store) {
    const storeList = this.props.store.store;
    if(storeList.length < 2) {
      message.warning('无法合并！', 3);
    }
    else {
      const s0 = storeList[0];
      const s1 = storeList[1];

      if( s0.getBounds().intersects(s1.getBounds()) ) {
        let coords = [];
        const union = turf.union(s0.toGeoJSON(), s1.toGeoJSON());
        const layer = this.props.map.ffmap.drawGeoJSON(union, {editable: true});

        s0.remove();
        s0.label.remove();

        s1.remove();
        s1.label.remove();

        s0.action = 'DELETE';
        s1.action = 'DELETE';
        this.props.map.ffmap.addOverlay(layer);
              
        const coordObj = turf.coordAll(union).map(item => {
          return {
            lat : item[1],
            lng : item[0]
          };
        });
        coords = FMap.Utils.getOriginalByLatlngs(coordObj);

        layer.coords = coords;
        layer.action = 'NEW';
        const _s = [layer].concat(storeList);
        this.props.dispatch({
          type : SET_STORE,
          data : _s
        });
        //手动添加一个名称label
        const centerLatLng = layer.getBounds().getCenter();
        this.props.newNameLabel(centerLatLng, layer, layer);

        layer.on('click', e => {
          this.props.initFeatureClick(e);
        });
      }
      else {
        message.error('无法合并！', 3);
      }
    }
  }

  //delete
  deleteStore() {
    if(!this.checkAct()) {return}
    this.props.dispatch({
      type : SET_STATUS,
      status : {
        isAdd : false,
        isEdit : false,
        isDelete : true,
        isMerge : false,
        isSubMerge : false,
        isZT : false,
        isStart : false,
        isActive : true
      }
    });
  }

  //商铺编辑
  editRegion() {
    if(!this.checkAct()) {return}

    this.props.dispatch({
      type : SET_STATUS,
      status : {
        isAdd : false,
        isEdit : true,
        isDelete : false,
        isMerge : false,
        isSubMerge : false,
        isZT : false,
        isStart : false,
        isActive : true
      }
    });
    // this.props.setState({status : {
    //   isAdd : false,
    //   isEdit : true,
    //   isDelete : false,
    //   isMerge : false,
    //   isSubMerge : false,
    //   isZT : false,
    //   isStart : false,
    //   isActive : true
    // }});
  }

  //检查是否可以进行下面操作
  checkAct() {
    const storeList = this.props.store.store;
    if(storeList.length > 0 && storeList[0].action != 'SHOW') {
      message.warning('您正在编辑状态，请先完成操作并保存，再进行其他操作！', 3);
      return false;
    }
    return true;
  }

  //开始编辑
  editStart() {
    Service.editStartAjax(
      preAjaxUrl + '/mapeditor/map/editStart/' + this.props.map.plazaId + '/' + this.props.map.floorId,
      () => {
          this.props.dispatch({
            type: SET_STATUS,
            status : {
              isAdd : true,
              isEdit : true,
              isDelete : true,
              isMerge : true,
              isSubMerge : false,
              isZT : true,
              isStart : false,
              isActive : false
            }
          });
      }
    );
  }

  //新增商铺
  drawPloy() {
    if(!this.checkAct()) {return}

    const newStore = this.props.map.ffmap.startPolygon();
    newStore.action = "NEW";

    this.props.dispatch({
        type : SET_STATUS,
        status : {
          isAdd : true,
          isEdit : false,
          isDelete : false,
          isMerge : false,
          isSubMerge : false,
          isZT : false,
          isStart : false,
          isActive : true
        }
    });

    this.props.dispatch({
      type : SET_STORE,
      data : [newStore]
    });

    newStore.on('click', e => {
      this.props.initFeatureClick(e);
    });
  }




  //----------------------------------------

  submitAll() {
    const store = this.props.store.store;
    if(store.length > 0 && store[0].action != 'SHOW') {
      Modal.warning({
          title : '提示',
          content : '您有操作未保存，请先保存！'
      });
    }
    //todo结束本次编辑。。。

    Service.editEndAjax(
      preAjaxUrl + '/mapeditor/map/editEnd/' + this.props.map.plazaId,
      () => {
        Modal.success({
          title : '',
          content : '已经提交审核，请耐心等待！'
        });
        this.props.dispatch({
          type : SET_STATUS,
          status : {
            isAdd : false,
            isEdit : false,
            isDelete : false,
            isMerge : false,
            isSubMerge : false,
            isZT : false,
            isStart : false,
            isActive : 2
          }
        });
      }
    );
  } 

  dropDown( { key } ) {
    this.props.setState({status : {
      isAdd : false,
      isEdit : false,
      isDelete : false,
      isMerge : false,
      isSubMerge : false,
      isZT : key,
      isStart : false,
      isActive : true
    }});
    const bulidZT = (name, type) => {
      const layer = this.state.ffmap.startPolygon({
        color: "#ff7800", 
        weight: 1
      });
      layer.name = name;
      layer.regionType = type;
      layer.action = 'NEW';

      this.props.setState({store : [layer]});
    };

    switch(parseInt(key)) {
      case 1:
        bulidZT('多经点位', '030201');
        break;
      case 2:
        break;
      case 3:
        bulidZT('万达百货', '万达百货');
        break;
      default:
        break;
    }
  }

  //取消操作
  cancelAct() {
    for(let i = 0, l = this.props.store.store.length; i < l; i++) {
      let item = this.props.store.store[i];
      let bkItem = this.props.store.bkStore[i];
      if(item.action == 'NEW') {
        if(item._proxy) {
          item._proxy.editor.map.editTools.stopDrawing();
        }
        
        if(item.graphics) {
          item.graphics.remove();
        }
        else {
          if(item.transform) {
            item.transform.disable();
          }
          item.remove();
        }

        if(item.label) {
          item.label.remove();
        }
      }
      else if(item.action == 'UPDATE') {
        item.disableEdit();
        item.setLatLngs(bkItem.latlng);
        if(item.name != bkItem.name) {
          item.re_name = bkItem.name;
          item.name = bkItem.name;
          if(item.label) {
            item.label.setContent(bkItem.name);
          }
        }

        if(item.re_type != bkItem.re_type) {
          item.re_type = bkItem.re_type;
        }
      }
      else if(item.action == 'DELETE') {
        this.props.map.ffmap.addOverlay(item);
        this.props.newNameLabel(item.getCenter(), item, item);
        item.label.setContent(item.feature.properties.re_name);
      }

      if(getSelect(item)) {
        setSelect(item, false);
      }
      
    }


    this.props.dispatch({
      type : SET_STATUS,
      status : {
        isAdd : true,
        isEdit : true,
        isDelete : true,
        isMerge : true,
        isSubMerge : false,
        isZT : true,
        isStart : false,
        isActive : false
      }
    })
    this.props.dispatch({
      type : SET_STORE,
      data : []
    })
    this.props.dispatch({
      type : SET_BKSTORE,
      data : []
    })
    
  }

  render() {
    const data = this.props.control;
    const menu = (
      <Menu onClick={this.dropDown}>
        <Menu.Item key="1">多经点</Menu.Item>
        <Menu.Item key="2">承重柱</Menu.Item>
        <Menu.Item key="3">万达百货</Menu.Item>
      </Menu>
    );
    const name0 = "s-btn s-cancel clearfix" + (data.isActive ? '' : ' disable');
    const name1 = "s-btn s-add clearfix" + (data.isAdd ? '' : ' disable');
    const name2 = "s-btn s-edit clearfix" + (data.isEdit ? '' : ' disable');
    const name3 = "s-btn s-delete clearfix" + (data.isDelete ? '' : ' disable');
    const name4 = "s-btn s-merge clearfix" + (data.isMerge ? '' : ' disable');
    const name5 = "s-btn s-zt clearfix" + (data.isZT ? '' : ' disable');

    const mergeStyle = {'display' : (data.isSubMerge ? 'none' : 'inline-block')};
    const submergeStyle = {'display' : (data.isSubMerge ? 'inline-block' : 'none')};

    const startStyle = {'display' : (data.isStart ? 'inline-block' : 'none')};
    const saveStyle = {'display' : (data.isStart || (data.isActive == 2) ? 'none' : 'inline-block')};
  
    return (
      <div className="control">
        <a className={name0} onClick={this.cancelAct}>取消操作</a>
        <a className={name1} onClick={this.drawPloy}><i className="s-icon"></i>新增商铺</a>
        <a className={name2} onClick={this.editRegion} ><i className="s-icon"></i>商铺编辑</a>
        <a className={name3} onClick={this.deleteStore}><i className="s-icon"></i>删除商铺</a>
        <a className={name4} style={mergeStyle} onClick={this.setMerge}><i className="s-icon"></i>商铺合并</a>
        <a className="s-btn s-merge clearfix" style={submergeStyle} onClick={this.mergeStore}><i className="s-icon"></i>执行合并</a>

        <Dropdown overlay={menu}>
          <span className={name5}><i className="s-icon"></i>专题数据<Icon type="down" /></span>
        </Dropdown>
        <Button className="e-save" style={startStyle} type="primary" onClick={this.editStart}>开始编辑</Button>
        <Button className="e-save" style={saveStyle} type="primary" onClick={this.saveEdit}>保存</Button>
        <Button className="e-save" type="primary" onClick={this.submitAll} disabled={data.isSubmit}>提交审核</Button>
        <SaveConfirm ref="saveConfirm" />
      </div>
    );
  }
}

function mapStateToProps(state) {
  // const testData = componentConfig['textField']['props'];
  return state;
}

export default connect(mapStateToProps)(Control);